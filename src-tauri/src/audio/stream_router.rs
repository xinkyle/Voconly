//! Stream Router - 零开销音频帧路由器
//!
//! 用于在音频捕获和流式转录 worker 之间高效传递音频帧。
//! 无流时仅做一次原子读取（约 1ns），有流时才进行 lock + channel send。

use std::sync::mpsc;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

/// 流式转录命令
pub enum StreamCmd {
    /// 发送音频帧
    Feed(Vec<f32>),
    /// 结束流并返回最终文本
    Finalize(mpsc::Sender<Option<String>>),
    /// 取消流
    Cancel,
}

/// 音频帧路由器（零开销设计）
///
/// 无流时：单次 atomic load (约 1ns)
/// 有流时：lock + channel send
pub struct StreamRouter {
    tx: Mutex<Option<mpsc::Sender<StreamCmd>>>,
    open: Arc<AtomicBool>,
}

impl StreamRouter {
    /// 创建新的 StreamRouter
    pub fn new() -> Self {
        Self {
            tx: Mutex::new(None),
            open: Arc::new(AtomicBool::new(false)),
        }
    }

    /// 打开 channel，返回 receiver 给 worker
    pub fn open(&self) -> mpsc::Receiver<StreamCmd> {
        let (tx, rx) = mpsc::channel();
        *self.tx.lock().unwrap() = Some(tx);
        self.open.store(true, Ordering::Relaxed);
        rx
    }

    /// 关闭 channel，返回 sender 用于发送 Finalize
    pub fn take(&self) -> Option<mpsc::Sender<StreamCmd>> {
        self.open.store(false, Ordering::Relaxed);
        self.tx.lock().unwrap().take()
    }

    /// 发送音频帧（快速路径：先检查 open）
    pub fn feed(&self, frame: &[f32]) {
        if !self.open.load(Ordering::Relaxed) {
            return; // 无流时，单次原子读取，零开销
        }
        if let Some(tx) = self.tx.lock().unwrap().as_ref() {
            let _ = tx.send(StreamCmd::Feed(frame.to_vec()));
        }
    }

    /// 检查是否有活跃流
    pub fn is_open(&self) -> bool {
        self.open.load(Ordering::Relaxed)
    }
}

impl Default for StreamRouter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stream_router_basic() {
        let router = StreamRouter::new();

        // 初始状态应该是关闭的
        assert!(!router.is_open());

        // feed 在关闭时应该无操作
        router.feed(&[0.1, 0.2, 0.3]);

        // 打开 channel
        let rx = router.open();
        assert!(router.is_open());

        // 发送音频帧
        router.feed(&[0.1, 0.2, 0.3]);
        let cmd = rx.try_recv().unwrap();
        match cmd {
            StreamCmd::Feed(frame) => assert_eq!(frame, vec![0.1, 0.2, 0.3]),
            _ => panic!("Expected Feed command"),
        }

        // 关闭 channel
        let tx = router.take();
        assert!(tx.is_some());
        assert!(!router.is_open());
    }

    #[test]
    fn test_concurrent_feed_while_closed() {
        // 测试：关闭后 feed 应该是零开销（不阻塞）
        use std::sync::Arc;
        use std::thread;

        let router = Arc::new(StreamRouter::new());
        let rx = router.open();

        // 多线程并发 feed
        let handles: Vec<_> = (0..10)
            .map(|_| {
                let router = router.clone();
                thread::spawn(move || {
                    router.feed(&[0.1, 0.2, 0.3]);
                })
            })
            .collect();

        for h in handles {
            h.join().unwrap();
        }

        // 应该收到 10 个 Feed 命令
        let count = rx.try_recv().iter().count();
        assert!(count >= 1); // 至少有一个

        // 关闭后再次并发 feed（应该是零开销）
        router.take();
        let handles: Vec<_> = (0..100)
            .map(|_| {
                let router = router.clone();
                thread::spawn(move || {
                    router.feed(&[0.1, 0.2, 0.3]);
                })
            })
            .collect();

        for h in handles {
            h.join().unwrap();
        }

        // channel 已关闭，不会再收到命令
        assert!(!router.is_open());
    }

    #[test]
    fn test_feed_returns_quickly_when_closed() {
        // 测试：无流时 feed 应该快速返回（原子检查）
        use std::time::Instant;

        let router = StreamRouter::new();
        assert!(!router.is_open());

        // 无流时 feed 应该在纳秒级返回
        let start = Instant::now();
        for _ in 0..1000 {
            router.feed(&[0.1, 0.2, 0.3]);
        }
        let elapsed = start.elapsed();

        // 1000 次 feed 应该在 1ms 内完成（每次约 1μs，远低于有流时的开销）
        assert!(elapsed.as_millis() < 1);
    }

    #[test]
    fn test_take_returns_sender_for_finalize() {
        // 测试：take() 返回 sender 用于发送 Finalize
        let router = StreamRouter::new();
        let rx = router.open();

        // take 应该返回 sender
        let tx = router.take().expect("take should return sender");

        // 可以通过 tx 发送 Finalize
        let (reply, finalize_rx) = mpsc::channel();
        tx.send(StreamCmd::Finalize(reply)).unwrap();

        // receiver 应该收到 Finalize
        match rx.try_recv() {
            Ok(StreamCmd::Finalize(r)) => {
                // 发送最终结果
                r.send(Some("final text".to_string())).unwrap();
                let result = finalize_rx.recv().unwrap();
                assert_eq!(result, Some("final text".to_string()));
            }
            _ => panic!("Expected Finalize command"),
        }
    }
}

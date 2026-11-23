use crate::paths::history_db_path;
use log::{info, warn};
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

/// 历史记录数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    pub id: String,
    pub timestamp: u64,
    pub content: String,
    pub duration: u32,
    pub word_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_content: Option<String>,
}

fn history_record_from_row(row: &Row<'_>) -> rusqlite::Result<HistoryRecord> {
    Ok(HistoryRecord {
        id: row.get(0)?,
        timestamp: row.get(1)?,
        content: row.get(2)?,
        duration: row.get(3)?,
        word_count: row.get(4)?,
        raw_content: row.get(5)?,
    })
}

#[derive(Debug, Serialize)]
pub struct HistorySearchResult {
    records: Vec<HistoryRecord>,
    total: u64,
}

/// 归档统计信息
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveStats {
    pub file_count: usize,
    pub total_records: usize,
}

/// 完整统计信息
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StatsData {
    pub total_duration: u64,
    pub total_words: u64,
    pub total_count: u64,
    pub today_count: u64,
    pub today_date: String,
    pub first_record_date: Option<String>,
    pub active_days: u64,
}

/// 数据库连接管理（使用 Mutex 保证线程安全）
static DB_CONN: Mutex<Option<Connection>> = Mutex::new(None);

/// 获取数据库连接（懒加载，单例模式）
fn get_db_connection() -> Result<Connection, String> {
    // 先检查是否已有连接
    {
        let conn_guard = DB_CONN
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        if conn_guard.is_some() {
            // SQLite Connection 不能 Clone，需要新建连接
            // 但rusqlite支持多连接，我们每次新建一个
        }
    }

    let db_path = history_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    // 初始化表结构
    init_db_schema(&conn)?;

    Ok(conn)
}

/// 初始化数据库表结构
fn init_db_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        -- 历史记录表
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            content TEXT NOT NULL,
            duration INTEGER NOT NULL,
            word_count INTEGER NOT NULL,
            raw_content TEXT
        );

        -- 时间戳索引（用于排序和分页）
        CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp DESC);

        -- 统计表（保留但不再使用增量更新）
        CREATE TABLE IF NOT EXISTS stats (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| format!("Failed to init database schema: {}", e))?;

    // 尝试添加 raw_content 列（如果不存在）
    // SQLite 不支持 IF NOT EXISTS，所以捕获错误并忽略
    match conn.execute("ALTER TABLE history ADD COLUMN raw_content TEXT", []) {
        Ok(_) => info!("Added raw_content column to history table"),
        Err(e) => {
            // 如果列已存在，会报错 "duplicate column name"，这是正常的
            if e.to_string().contains("duplicate column name") {
                info!("raw_content column already exists");
            } else {
                warn!("Failed to add raw_content column: {}", e);
            }
        }
    }

    info!("Database schema initialized");
    Ok(())
}

/// 加载历史记录（分页，每次100条）
#[tauri::command]
pub fn load_history() -> Result<Vec<HistoryRecord>, String> {
    load_history_paged(1, 100)
}

/// 分页加载历史记录
#[tauri::command]
pub fn load_history_paged(page: u32, page_size: u32) -> Result<Vec<HistoryRecord>, String> {
    info!("Loading history records, page={}, size={}", page, page_size);

    let conn = get_db_connection()?;
    let offset = (page - 1) * page_size;

    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, content, duration, word_count, raw_content
             FROM history
             ORDER BY timestamp DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let records: Vec<_> = stmt
        .query_map(params![page_size, offset], history_record_from_row)
        .map_err(|e| format!("Failed to query history: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    info!("Loaded {} history records", records.len());
    Ok(records)
}

/// 搜索全部历史记录中的转录结果和原文
#[tauri::command]
pub async fn search_history(
    query: String,
    page: u32,
    page_size: u32,
) -> Result<HistorySearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = get_db_connection()?;
        query_history_search(&mut conn, &query, page, page_size)
            .map_err(|error| format!("Failed to search history: {error}"))
    })
    .await
    .map_err(|error| format!("History search task failed: {error}"))?
}

fn query_history_search(
    conn: &mut Connection,
    query: &str,
    page: u32,
    page_size: u32,
) -> rusqlite::Result<HistorySearchResult> {
    const MATCHES: &str = r"content LIKE ?1 ESCAPE '\' OR raw_content LIKE ?1 ESCAPE '\'";

    let keywords = query
        .split_whitespace()
        .map(|word| {
            word.replace('\\', r"\\")
                .replace('%', r"\%")
                .replace('_', r"\_")
        })
        .collect::<Vec<_>>()
        .join("%");
    if keywords.is_empty() {
        return Ok(HistorySearchResult {
            records: Vec::new(),
            total: 0,
        });
    }

    let pattern = format!("%{keywords}%");
    let limit = page_size.clamp(1, 100);
    let offset = i64::from(page.saturating_sub(1)) * i64::from(limit);

    // Keep the count and page consistent if a record changes during the search.
    let tx = conn.transaction()?;
    let total = tx.query_row(
        &format!("SELECT COUNT(*) FROM history WHERE {MATCHES}"),
        [&pattern],
        |row| row.get(0),
    )?;
    let mut stmt = tx.prepare(&format!(
        "SELECT id, timestamp, content, duration, word_count, raw_content
         FROM history
         WHERE {MATCHES}
         ORDER BY timestamp DESC, id DESC
         LIMIT ?2 OFFSET ?3"
    ))?;
    let records = stmt
        .query_map(params![pattern, limit, offset], history_record_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(HistorySearchResult { records, total })
}

/// 获取总记录数
#[tauri::command]
pub fn get_history_count() -> Result<u64, String> {
    let conn = get_db_connection()?;

    let count: u64 = conn
        .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count history: {}", e))?;

    Ok(count)
}

/// 保存历史记录（全量替换，用于前端同步）
/// 注意：这个方法在SQLite模式下会清空表再插入，主要用于兼容旧接口
#[tauri::command]
pub fn save_history(history: Vec<HistoryRecord>) -> Result<(), String> {
    info!("Saving {} history records (replacing all)", history.len());

    let mut conn = get_db_connection()?;

    // 清空表
    conn.execute("DELETE FROM history", [])
        .map_err(|e| format!("Failed to clear history: {}", e))?;

    // 批量插入
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    for record in &history {
        tx.execute(
            "INSERT INTO history (id, timestamp, content, duration, word_count, raw_content)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                record.id,
                record.timestamp,
                record.content,
                record.duration,
                record.word_count,
                record.raw_content
            ],
        )
        .map_err(|e| format!("Failed to insert record: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    info!("History saved successfully");
    Ok(())
}

/// 添加一条历史记录
#[tauri::command]
pub fn add_history_record(
    content: String,
    duration: u32,
    word_count: u32,
    timestamp: u64,
    raw_content: Option<String>,
) -> Result<HistoryRecord, String> {
    info!(
        "Adding history record: {} words, {} seconds, timestamp {}, has_raw_content: {}",
        word_count,
        duration,
        timestamp,
        raw_content.is_some()
    );

    let conn = get_db_connection()?;

    let new_record = HistoryRecord {
        id: format!("{}-{:09}", timestamp, rand_number()),
        timestamp,
        content,
        duration,
        word_count,
        raw_content,
    };

    conn.execute(
        "INSERT INTO history (id, timestamp, content, duration, word_count, raw_content)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            new_record.id,
            new_record.timestamp,
            new_record.content,
            new_record.duration,
            new_record.word_count,
            new_record.raw_content
        ],
    )
    .map_err(|e| format!("Failed to insert record: {}", e))?;

    info!("History record added successfully");
    Ok(new_record)
}

/// 删除一条历史记录
#[tauri::command]
pub fn delete_history_record(id: String) -> Result<(), String> {
    info!("Deleting history record: {}", id);

    let conn = get_db_connection()?;

    // 删除记录
    let rows_deleted = conn
        .execute("DELETE FROM history WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete record: {}", e))?;

    if rows_deleted > 0 {
        info!("History record deleted successfully");
    } else {
        warn!("History record not found: {}", id);
    }

    Ok(())
}

/// 清空所有历史记录
#[tauri::command]
pub fn clear_history() -> Result<(), String> {
    info!("Clearing all history records");

    let conn = get_db_connection()?;

    conn.execute("DELETE FROM history", [])
        .map_err(|e| format!("Failed to clear history: {}", e))?;

    info!("All history records cleared");
    Ok(())
}

/// 获取归档统计信息
/// SQLite模式下不再有归档文件，返回总记录数
#[tauri::command]
pub fn get_archive_stats() -> Result<ArchiveStats, String> {
    let count = get_history_count()?;
    Ok(ArchiveStats {
        file_count: 1, // 单数据库文件
        total_records: count as usize,
    })
}

/// 获取完整统计信息（实时计算）
#[tauri::command]
pub fn get_full_stats() -> Result<StatsData, String> {
    let conn = get_db_connection()?;
    compute_stats_from_history(&conn)
}

/// 重新计算统计数据（从数据库实时计算）
#[tauri::command]
pub fn rebuild_stats() -> Result<StatsData, String> {
    let conn = get_db_connection()?;
    compute_stats_from_history(&conn)
}

/// 内部函数：实时计算统计数据
fn compute_stats_from_history(conn: &Connection) -> Result<StatsData, String> {
    let today = get_today_date_string();

    // 一次查询获取所有统计
    // 注意：timestamp 是毫秒级，需要除以 1000 转换为秒，才能正确使用 unixepoch
    let stats: StatsData = conn
        .query_row(
            "SELECT
                COALESCE(SUM(duration), 0) as total_duration,
                COALESCE(SUM(word_count), 0) as total_words,
                COUNT(*) as total_count,
                SUM(CASE WHEN DATE(timestamp/1000, 'unixepoch', 'localtime') = ?1 THEN 1 ELSE 0 END) as today_count,
                COUNT(DISTINCT DATE(timestamp/1000, 'unixepoch', 'localtime')) as active_days,
                MIN(DATE(timestamp/1000, 'unixepoch', 'localtime')) as first_record_date
            FROM history",
            params![today],
            |row| {
                Ok(StatsData {
                    total_duration: row.get::<_, u64>(0)?,
                    total_words: row.get::<_, u64>(1)?,
                    total_count: row.get::<_, u64>(2)?,
                    today_count: row.get::<_, u64>(3)?,
                    today_date: today.clone(),
                    active_days: row.get::<_, u64>(4)?,
                    first_record_date: row.get::<_, Option<String>>(5)?,
                })
            },
        )
        .map_err(|e| format!("Failed to compute stats: {}", e))?;

    Ok(stats)
}

/// 生成随机数
fn rand_number() -> u32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    ((seed.wrapping_mul(1103515245).wrapping_add(12345)) >> 16) as u32 % 1_000_000_000
}

/// 获取今天的日期字符串
fn get_today_date_string() -> String {
    let now = chrono::Local::now();
    now.format("%Y-%m-%d").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_search_matches_older_records_and_paginates_by_timestamp() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_db_schema(&conn).unwrap();
        conn.execute_batch(
            "INSERT INTO history (id, timestamp, content, duration, word_count, raw_content) VALUES
                ('original', 1, '整理后的内容', 2, 5, '会议讨论了 Budget'),
                ('processed', 2, '会议确认了 BUDGET', 2, 5, NULL),
                ('unrelated', 3, '会议纪要', 2, 4, '其他')",
        )
        .unwrap();
        for timestamp in 4..=105 {
            conn.execute(
                "INSERT INTO history (id, timestamp, content, duration, word_count)
                 VALUES (?1, ?1, '其他记录', 2, 4)",
                [timestamp],
            )
            .unwrap();
        }

        let first = query_history_search(&mut conn, "  会议  budget  ", 1, 1).unwrap();
        assert_eq!(first.total, 2);
        assert_eq!(first.records[0].id, "processed");

        let second = query_history_search(&mut conn, "会议 budget", 2, 1).unwrap();
        assert_eq!(second.total, 2);
        assert_eq!(second.records[0].id, "original");
        assert_eq!(
            second.records[0].raw_content.as_deref(),
            Some("会议讨论了 Budget")
        );
    }

    #[test]
    fn history_search_treats_sql_wildcards_as_literal_text() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_db_schema(&conn).unwrap();
        conn.execute_batch(
            r"INSERT INTO history (id, timestamp, content, duration, word_count) VALUES
                ('literal', 1, '进度 10%_\ready', 2, 5),
                ('similar', 2, '进度 100 ready', 2, 5)",
        )
        .unwrap();

        let result = query_history_search(&mut conn, r"%_\", 1, 10).unwrap();
        assert_eq!(result.total, 1);
        assert_eq!(result.records[0].id, "literal");

        let empty = query_history_search(&mut conn, "没有匹配", 1, 10).unwrap();
        assert_eq!(empty.total, 0);
        assert!(empty.records.is_empty());
    }
}

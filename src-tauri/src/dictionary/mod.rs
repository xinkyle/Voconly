//! 用户词典模块
//! 提供语音识别结果的后处理修正功能

mod config;
mod matcher;

pub use config::{DictionaryEntry, UserDictionary};
pub use matcher::DictionaryMatcher;

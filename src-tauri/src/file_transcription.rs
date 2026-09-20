use crate::paths::history_db_path;
use log::{info, warn};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// 文件转录记录数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTranscriptionRecord {
    pub id: String,
    pub filename: String,
    pub file_path: Option<String>,
    pub file_size: u64,
    pub duration: u32,
    pub transcript_text: String,
    pub word_count: u32,
    pub timestamp: u64,
    pub asr_model_id: String,
}

/// 数据库连接管理
static FILE_DB_CONN: Mutex<Option<Connection>> = Mutex::new(None);

/// 获取数据库连接
fn get_file_db_connection() -> Result<Connection, String> {
    let db_path = history_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    // 初始化表结构
    init_file_db_schema(&conn)?;

    Ok(conn)
}

/// 初始化文件转录表结构
fn init_file_db_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        -- 文件转录记录表
        CREATE TABLE IF NOT EXISTS file_transcriptions (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            file_path TEXT,
            file_size INTEGER NOT NULL,
            duration INTEGER NOT NULL,
            transcript_text TEXT NOT NULL,
            word_count INTEGER NOT NULL,
            timestamp INTEGER NOT NULL,
            asr_model_id TEXT NOT NULL
        );

        -- 时间戳索引
        CREATE INDEX IF NOT EXISTS idx_file_transcriptions_timestamp ON file_transcriptions(timestamp DESC);
        ",
    )
    .map_err(|e| format!("Failed to init file transcription schema: {}", e))?;

    info!("File transcription schema initialized");
    Ok(())
}
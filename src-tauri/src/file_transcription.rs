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

/// 加载文件转录历史记录
#[tauri::command]
pub fn load_file_transcription_history() -> Result<Vec<FileTranscriptionRecord>, String> {
    let conn = get_file_db_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, filename, file_path, file_size, duration, transcript_text,
                    word_count, timestamp, asr_model_id
             FROM file_transcriptions
             ORDER BY timestamp DESC
             LIMIT 100"
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let records = stmt
        .query_map([], |row| {
            Ok(FileTranscriptionRecord {
                id: row.get(0)?,
                filename: row.get(1)?,
                file_path: row.get(2)?,
                file_size: row.get(3)?,
                duration: row.get(4)?,
                transcript_text: row.get(5)?,
                word_count: row.get(6)?,
                timestamp: row.get(7)?,
                asr_model_id: row.get(8)?,
            })
        })
        .map_err(|e| format!("Failed to query records: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect records: {}", e))?;

    Ok(records)
}

/// 保存文件转录记录
#[tauri::command]
pub fn save_file_transcription(record: FileTranscriptionRecord) -> Result<(), String> {
    let conn = get_file_db_connection()?;

    conn.execute(
        "INSERT INTO file_transcriptions
         (id, filename, file_path, file_size, duration, transcript_text, word_count, timestamp, asr_model_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            record.id,
            record.filename,
            record.file_path,
            record.file_size,
            record.duration,
            record.transcript_text,
            record.word_count,
            record.timestamp,
            record.asr_model_id,
        ],
    )
    .map_err(|e| format!("Failed to save record: {}", e))?;

    info!("File transcription saved: {}", record.id);
    Ok(())
}

/// 删除单条文件转录记录
#[tauri::command]
pub fn delete_file_transcription(id: String) -> Result<(), String> {
    let conn = get_file_db_connection()?;

    conn.execute(
        "DELETE FROM file_transcriptions WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("Failed to delete record: {}", e))?;

    info!("File transcription deleted: {}", id);
    Ok(())
}

/// 清空文件转录历史
#[tauri::command]
pub fn clear_file_transcription_history() -> Result<(), String> {
    let conn = get_file_db_connection()?;

    conn.execute("DELETE FROM file_transcriptions", [])
        .map_err(|e| format!("Failed to clear history: {}", e))?;

    info!("File transcription history cleared");
    Ok(())
}
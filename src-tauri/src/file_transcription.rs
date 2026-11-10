use crate::paths::history_db_path;
use log::info;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

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
    #[serde(default)]
    pub processed_text: Option<String>,
    #[serde(default)]
    pub ai_status: Option<String>,
    #[serde(default)]
    pub ai_error: Option<String>,
    #[serde(default)]
    pub ai_model_id: Option<String>,
    #[serde(default)]
    pub ai_prompt_name: Option<String>,
}

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

    // Existing installations keep their original rows. Add nullable fields only once.
    let columns = {
        let mut stmt = conn.prepare("PRAGMA table_info(file_transcriptions)")
            .map_err(|e| e.to_string())?;
        let result = stmt.query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        result
    };
    for column in ["processed_text", "ai_status", "ai_error", "ai_model_id", "ai_prompt_name"] {
        if !columns.iter().any(|name| name == column) {
            conn.execute(&format!("ALTER TABLE file_transcriptions ADD COLUMN {} TEXT", column), [])
                .map_err(|e| format!("Failed to migrate file transcription schema: {}", e))?;
        }
    }

    info!("File transcription schema initialized");
    Ok(())
}

/// 加载文件转录历史记录
#[tauri::command]
pub fn load_file_transcription_history() -> Result<Vec<FileTranscriptionRecord>, String> {
    let conn = get_file_db_connection()?;
    load_records(&conn)
}

fn load_records(conn: &Connection) -> Result<Vec<FileTranscriptionRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, filename, file_path, file_size, duration, transcript_text,
                    word_count, timestamp, asr_model_id, processed_text,
                    ai_status, ai_error, ai_model_id, ai_prompt_name
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
                processed_text: row.get(9)?,
                ai_status: row.get(10)?,
                ai_error: row.get(11)?,
                ai_model_id: row.get(12)?,
                ai_prompt_name: row.get(13)?,
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
    save_record(&conn, &record)
}

fn save_record(conn: &Connection, record: &FileTranscriptionRecord) -> Result<(), String> {
    conn.execute(
        "INSERT INTO file_transcriptions
         (id, filename, file_path, file_size, duration, transcript_text, word_count, timestamp,
          asr_model_id, processed_text, ai_status, ai_error, ai_model_id, ai_prompt_name)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT(id) DO UPDATE SET
           processed_text = excluded.processed_text,
           ai_status = excluded.ai_status, ai_error = excluded.ai_error,
           ai_model_id = excluded.ai_model_id, ai_prompt_name = excluded.ai_prompt_name",
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
            record.processed_text,
            record.ai_status,
            record.ai_error,
            record.ai_model_id,
            record.ai_prompt_name,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_history_migrates_without_losing_original_and_updates_same_row() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE file_transcriptions (
            id TEXT PRIMARY KEY, filename TEXT NOT NULL, file_path TEXT,
            file_size INTEGER NOT NULL, duration INTEGER NOT NULL,
            transcript_text TEXT NOT NULL, word_count INTEGER NOT NULL,
            timestamp INTEGER NOT NULL, asr_model_id TEXT NOT NULL);
            INSERT INTO file_transcriptions VALUES ('legacy', 'test.wav', NULL, 10, 3, '原文', 2, 1, 'asr');").unwrap();
        init_file_db_schema(&conn).unwrap();
        init_file_db_schema(&conn).unwrap(); // migration is idempotent
        let mut record = load_records(&conn).unwrap().remove(0);
        assert_eq!(record.transcript_text, "原文");
        assert!(record.processed_text.is_none());
        record.processed_text = Some("润色结果".to_string());
        record.ai_status = Some("completed".to_string());
        record.ai_model_id = Some("provider/model".to_string());
        record.ai_prompt_name = Some("lightPolish".to_string());
        save_record(&conn, &record).unwrap();
        let records = load_records(&conn).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].processed_text.as_deref(), Some("润色结果"));
        assert_eq!(records[0].transcript_text, "原文");
        record.ai_status = Some("error".to_string());
        record.ai_error = Some("CONTEXT_TOO_LONG:100:20".to_string());
        save_record(&conn, &record).unwrap();
        let failed = load_records(&conn).unwrap().remove(0);
        assert_eq!(failed.processed_text.as_deref(), Some("润色结果"));
        assert_eq!(failed.ai_error.as_deref(), Some("CONTEXT_TOO_LONG:100:20"));
        assert_eq!(failed.ai_prompt_name.as_deref(), Some("lightPolish"));
    }

    #[test]
    fn old_frontend_records_deserialize_with_optional_ai_fields() {
        let record: FileTranscriptionRecord = serde_json::from_str(r#"{
            "id":"old", "filename":"a.wav", "fileSize":1, "duration":1,
            "transcriptText":"original", "wordCount":8, "timestamp":1,
            "asrModelId":"asr" }"#).unwrap();
        assert!(record.ai_status.is_none());
        assert!(record.processed_text.is_none());
    }
}

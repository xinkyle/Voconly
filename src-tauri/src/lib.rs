// Voconly Library
// Provides Rust commands for the Tauri frontend

pub mod backends;
pub mod catalog;
pub mod config;
pub mod dictionary;
pub mod file_ops;
pub mod llm;
pub mod llm_models;
pub mod model_manager;
pub mod paths;
pub mod performance;
pub mod presets;
pub mod updater;
pub mod utils;

pub fn run() {
    println!("Voconly library loaded");
}

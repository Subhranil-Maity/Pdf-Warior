#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum AppError {
    #[error("PDF error: {0}")]
    Pdf(String),
    #[error("IO error: {0}")]
    Io(String),
    #[error("Render error: {0}")]
    Render(String),
}

impl From<lopdf::Error> for AppError {
    fn from(e: lopdf::Error) -> Self { Self::Pdf(e.to_string()) }
}
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { Self::Io(e.to_string()) }
}

pub type Result<T> = std::result::Result<T, AppError>;

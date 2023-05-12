use async_graphql::ErrorExtensions;
use axum::Json;
use base64::DecodeError as Base64DecodeError;
use hyper::StatusCode;
use jsonwebtoken::errors::{Error as JwtError, ErrorKind as JwtErrorKind};
use serde::{Deserialize, Serialize};
use surrealdb::{error::Db as SrlDbError, Error as SrlError};
use thiserror::Error;
use tracing::error;
use typeshare::typeshare;

pub type Result<T> = std::result::Result<T, Error>;

#[typeshare]
#[derive(Debug, Clone, Error, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "code", content = "message")]
pub enum Error {
    #[error("Unauthenticated")]
    Unauthenticated,
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Credentials are invalid")]
    CredentialsInvalid,

    #[error("Handle already exists")]
    HandleAlreadyExists,

    #[error("JWT is malformed")]
    JwtMalformed,
    #[error("JWT is expired")]
    JwtExpired,
    #[error("JWT is invalid")]
    JwtInvalid,

    #[error("GraphQL WebSocket init must be an object, null, or undefined")]
    WsInitNotObject,
    #[error("GraphQL WebSocket init `token` must be a string or undefined")]
    WsInitTokenNotString,

    #[error("The server is misconfigured")]
    ServerMisconfigured(String),
    #[error("An internal server error occurred")]
    InternalServerError(String),
    #[error("Feature is not implemented yet")]
    NotImplemented,
}

impl Error {
    pub fn from_err<T>(err: T) -> Self
    where
        T: std::error::Error,
    {
        Self::InternalServerError(err.to_string())
    }

    pub fn code(&self) -> String {
        match self {
            Self::ServerMisconfigured(_) => "ServerMisconfigured".into(),
            Self::InternalServerError(_) => "InternalServerError".into(),
            _ => format!("{:?}", self),
        }
    }

    fn log(&self) {
        match self {
            Self::ServerMisconfigured(err) => error!("Server misconfigured: {}", err),
            Self::InternalServerError(err) => error!("Internal server error: {}", err),
            Self::NotImplemented => error!("Unimplemented feature called"),
            _ => (),
        };
    }
}

impl From<String> for Error {
    fn from(err: String) -> Self {
        Self::InternalServerError(err)
    }
}

impl From<&String> for Error {
    fn from(err: &String) -> Self {
        Self::InternalServerError(err.into())
    }
}

impl From<&str> for Error {
    fn from(err: &str) -> Self {
        Self::InternalServerError(err.into())
    }
}

impl ErrorExtensions for Error {
    fn extend(&self) -> async_graphql::Error {
        // Since this is the end for our errors before they are sent to the client,
        // we should log important ones here.
        self.log();

        async_graphql::Error::new(self.to_string()).extend_with(|_, e| {
            e.set("code", self.code());
        })
    }
}

impl From<JwtError> for Error {
    fn from(err: JwtError) -> Self {
        match err.kind() {
            JwtErrorKind::InvalidToken
            | JwtErrorKind::InvalidAlgorithmName
            | JwtErrorKind::InvalidKeyFormat => Self::JwtMalformed,
            JwtErrorKind::InvalidEcdsaKey => Self::ServerMisconfigured("EcDSA key invalid".into()),
            JwtErrorKind::InvalidRsaKey(err) => {
                Self::ServerMisconfigured(format!("RSA key is invalid: {}", err))
            }
            JwtErrorKind::RsaFailedSigning => {
                Self::ServerMisconfigured("RSA signing failed".into())
            }
            JwtErrorKind::ExpiredSignature => Self::JwtExpired,
            JwtErrorKind::Crypto(_) => "JWT crypto error".into(),
            _ => Self::JwtInvalid,
        }
    }
}

impl From<SrlError> for Error {
    fn from(err: SrlError) -> Self {
        match err {
            // This error only occurs when SurrealDB is misconfigured.
            SrlError::Db(SrlDbError::Ds(err)) => Self::ServerMisconfigured(err),
            // All other errors are either transient or incorrect logic.
            err => Self::from_err(err),
        }
    }
}

impl From<ring::error::Unspecified> for Error {
    fn from(_: ring::error::Unspecified) -> Self {
        Self::CredentialsInvalid
    }
}

impl From<Base64DecodeError> for Error {
    fn from(err: Base64DecodeError) -> Self {
        Self::from_err(err)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorData {
    code: String,
    message: String,
}

pub type ErrorResponse = (StatusCode, Json<ErrorData>);

impl From<Error> for ErrorResponse {
    fn from(err: Error) -> Self {
        // This is the last point before the error is sent back to the client, so
        // log the important ones here.
        err.log();

        let code = match err {
            Error::Unauthenticated
            | Error::CredentialsInvalid
            | Error::JwtExpired
            | Error::JwtInvalid => StatusCode::UNAUTHORIZED,
            Error::Unauthorized => StatusCode::FORBIDDEN,
            Error::HandleAlreadyExists => StatusCode::CONFLICT,
            Error::JwtMalformed | Error::WsInitNotObject | Error::WsInitTokenNotString => {
                StatusCode::BAD_REQUEST
            }
            Error::ServerMisconfigured(_)
            | Error::InternalServerError(_)
            | Error::NotImplemented => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let data = ErrorData {
            code: err.code(),
            message: err.to_string(),
        };
        (code, Json(data))
    }
}

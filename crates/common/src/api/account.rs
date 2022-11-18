use std::ops::Deref;

use derive_more::From;
use serde::{Deserialize, Serialize};

#[derive(Debug, From, Serialize, Deserialize)]
pub enum Method<'a> {
    #[serde(borrow)]
    Login(LoginReq<'a>),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginReq<'a> {
    pub uname: &'a str,
    pub pword: &'a str,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum LoginRes {
    Success(Account),
    Failed,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub name: Option<String>,
}

impl Deref for LoginRes {
    type Target = Self;

    fn deref(&self) -> &Self::Target {
        &self
    }
}
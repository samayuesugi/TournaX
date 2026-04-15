use axum::{
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use dashmap::DashMap;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::sync::Arc;

// ─── UserResponse struct (avoids serde_json::json! recursion limit) ───────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserResponse {
    id: i32,
    email: String,
    name: Option<String>,
    handle: Option<String>,
    avatar: String,
    game: Option<String>,
    game_uid: Option<String>,
    role: String,
    balance: f64,
    silver_coins: i32,
    status: String,
    profile_setup: bool,
    followers_count: i32,
    following_count: i32,
    instagram: Option<String>,
    discord: Option<String>,
    x: Option<String>,
    youtube: Option<String>,
    twitch: Option<String>,
    referral_code: Option<String>,
    referral_bonus_active: bool,
    referral_bonus_until: Option<String>,
    paid_matches_played: i32,
    equipped_frame: Option<String>,
    equipped_badge: Option<String>,
    equipped_handle_color: Option<String>,
    is_esports_player: bool,
    trust_score: i32,
    trust_tier: String,
    host_rating_avg: f64,
    host_rating_count: i32,
    host_badge: String,
    bio: Option<String>,
    ingame_role: Option<String>,
    profile_animation: Option<String>,
    profile_color: Option<String>,
    game_ign: Option<String>,
    tournament_wins: i32,
    state: Option<String>,
    city: Option<String>,
    login_streak: i32,
    max_streak: i32,
}

use crate::email::send_otp_email;
use crate::AppState;

// ─── OTP Store Types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct OtpEntry {
    pub otp: String,
    pub expiry: i64,
    pub attempts: u8,
    pub otp_type: OtpType,
    pub pending: Option<PendingReg>,
}

#[derive(Debug, Clone)]
pub enum OtpType {
    Register,
    Reset,
}

#[derive(Debug, Clone)]
pub struct PendingReg {
    pub email: String,
    pub password_hash: String,
    pub referral_code: Option<String>,
}

// ─── JWT Claims ───────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct AuthClaims {
    #[serde(rename = "userId")]
    user_id: i32,
    exp: usize,
}

#[derive(Serialize, Deserialize)]
struct ResetClaims {
    email: String,
    purpose: String,
    exp: usize,
}

// ─── DB User Row ──────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct DbUser {
    pub id: i32,
    pub email: String,
    pub password: Option<String>,
    pub google_id: Option<String>,
    pub name: Option<String>,
    pub handle: Option<String>,
    pub avatar: Option<String>,
    pub game: Option<String>,
    pub game_uid: Option<String>,
    pub role: String,
    pub balance: f64,
    pub silver_coins: i32,
    pub last_login_date: Option<String>,
    pub login_streak: i32,
    pub max_streak: i32,
    pub paid_matches_played: i32,
    pub status: String,
    pub profile_setup: bool,
    pub followers_count: i32,
    pub following_count: i32,
    pub instagram: Option<String>,
    pub discord: Option<String>,
    pub x: Option<String>,
    pub youtube: Option<String>,
    pub twitch: Option<String>,
    pub referral_code: Option<String>,
    pub referral_bonus_until: Option<String>,
    pub daily_task_date: Option<String>,
    pub daily_wins: i32,
    pub daily_paid_matches: i32,
    pub tournament_wins: i32,
    pub daily_tournament_wins: i32,
    pub daily_invite_shared: i32,
    pub equipped_frame: Option<String>,
    pub equipped_badge: Option<String>,
    pub equipped_handle_color: Option<String>,
    pub is_esports_player: bool,
    pub game_ign: Option<String>,
    pub trust_score: i32,
    pub trust_tier: String,
    pub host_rating_avg: f64,
    pub host_rating_count: i32,
    pub host_badge: String,
    pub bio: Option<String>,
    pub ingame_role: Option<String>,
    pub profile_animation: Option<String>,
    pub profile_color: Option<String>,
    pub state: Option<String>,
    pub city: Option<String>,
}

// ─── Request/Response Bodies ──────────────────────────────────────────────────

#[derive(Deserialize)]
struct SendRegisterOtpBody {
    email: Option<String>,
    password: Option<String>,
    #[serde(rename = "referralCode")]
    referral_code: Option<String>,
}

#[derive(Deserialize)]
struct VerifyRegisterBody {
    email: Option<String>,
    otp: Option<String>,
}

#[derive(Deserialize)]
struct ForgotPasswordBody {
    email: Option<String>,
}

#[derive(Deserialize)]
struct VerifyResetOtpBody {
    email: Option<String>,
    otp: Option<String>,
}

#[derive(Deserialize)]
struct ResetPasswordBody {
    #[serde(rename = "resetToken")]
    reset_token: Option<String>,
    #[serde(rename = "newPassword")]
    new_password: Option<String>,
}

#[derive(Deserialize)]
struct LoginBody {
    email: Option<String>,
    password: Option<String>,
}

#[derive(Deserialize)]
struct SetupProfileBody {
    avatar: Option<String>,
    game: Option<String>,
    name: Option<String>,
    handle: Option<String>,
}

#[derive(Deserialize)]
struct UpdateMeBody {
    name: Option<String>,
    handle: Option<String>,
}

#[derive(Deserialize)]
struct GoogleCallbackQuery {
    code: Option<String>,
    error: Option<String>,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn today_date() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

fn yesterday_date() -> String {
    (Utc::now() - Duration::days(1))
        .format("%Y-%m-%d")
        .to_string()
}

fn compute_new_streak(last_login_date: Option<&str>, current_streak: i32) -> i32 {
    if last_login_date == Some(yesterday_date().as_str()) {
        current_streak + 1
    } else {
        1
    }
}

fn generate_otp() -> String {
    let mut rng = rand::thread_rng();
    format!("{:06}", rng.gen_range(100000u32..=999999u32))
}

fn otp_key(email: &str, kind: &str) -> String {
    format!("{}:{}", kind, email.to_lowercase())
}

fn clean_expired_otps(store: &DashMap<String, OtpEntry>) {
    let now = Utc::now().timestamp_millis();
    store.retain(|_, v| v.expiry > now);
}

fn generate_token(user_id: i32, secret: &str) -> String {
    let exp = (Utc::now() + Duration::days(30)).timestamp() as usize;
    let claims = AuthClaims { user_id, exp };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .expect("JWT encode failed")
}

pub fn verify_jwt(token: &str, secret: &str) -> Option<i32> {
    let mut validation = Validation::default();
    validation.validate_exp = true;
    decode::<AuthClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .ok()
    .map(|d| d.claims.user_id)
}

async fn hash_password(password: &str) -> String {
    let pw = password.to_string();
    tokio::task::spawn_blocking(move || bcrypt::hash(&pw, 12).expect("bcrypt hash failed"))
        .await
        .expect("spawn_blocking failed")
}

async fn verify_password(password: &str, hash: &str) -> bool {
    let pw = password.to_string();
    let h = hash.to_string();
    tokio::task::spawn_blocking(move || bcrypt::verify(&pw, &h).unwrap_or(false))
        .await
        .unwrap_or(false)
}

fn trust_tier_for_score(score: i32) -> &'static str {
    if score < 300 {
        "Risky"
    } else if score < 500 {
        "Beginner"
    } else if score < 700 {
        "Trusted"
    } else if score < 900 {
        "Veteran"
    } else {
        "Elite"
    }
}

fn serialize_user(user: &DbUser) -> UserResponse {
    let today = today_date();
    let referral_bonus_active = user
        .referral_bonus_until
        .as_deref()
        .map_or(false, |d| d >= today.as_str());
    UserResponse {
        id: user.id,
        email: user.email.clone(),
        name: user.name.clone(),
        handle: user.handle.clone(),
        avatar: user.avatar.clone().unwrap_or_else(|| "🔥".to_string()),
        game: user.game.clone(),
        game_uid: user.game_uid.clone(),
        role: user.role.clone(),
        balance: user.balance,
        silver_coins: user.silver_coins,
        status: user.status.clone(),
        profile_setup: user.profile_setup,
        followers_count: user.followers_count,
        following_count: user.following_count,
        instagram: user.instagram.clone(),
        discord: user.discord.clone(),
        x: user.x.clone(),
        youtube: user.youtube.clone(),
        twitch: user.twitch.clone(),
        referral_code: user.referral_code.clone(),
        referral_bonus_active,
        referral_bonus_until: user.referral_bonus_until.clone(),
        paid_matches_played: user.paid_matches_played,
        equipped_frame: user.equipped_frame.clone(),
        equipped_badge: user.equipped_badge.clone(),
        equipped_handle_color: user.equipped_handle_color.clone(),
        is_esports_player: user.is_esports_player,
        trust_score: user.trust_score,
        trust_tier: user.trust_tier.clone(),
        host_rating_avg: user.host_rating_avg,
        host_rating_count: user.host_rating_count,
        host_badge: user.host_badge.clone(),
        bio: user.bio.clone(),
        ingame_role: user.ingame_role.clone(),
        profile_animation: user.profile_animation.clone(),
        profile_color: user.profile_color.clone(),
        game_ign: user.game_ign.clone(),
        tournament_wins: user.tournament_wins,
        state: user.state.clone(),
        city: user.city.clone(),
        login_streak: user.login_streak,
        max_streak: user.max_streak,
    }
}

pub fn err_json(status: StatusCode, msg: &str) -> Response {
    let mut res = (status, Json(json!({ "error": msg }))).into_response();
    cors(res.headers_mut());
    res
}

pub fn ok_json(body: Value) -> Response {
    let mut res = Json(body).into_response();
    cors(res.headers_mut());
    res
}

fn user_json(user: &DbUser) -> Response {
    let mut res = Json(serialize_user(user)).into_response();
    cors(res.headers_mut());
    res
}

fn user_with_token_json(user: &DbUser, token: &str, extra: Value) -> Response {
    let user_val = serde_json::to_value(serialize_user(user)).unwrap_or(Value::Null);
    let mut map = serde_json::Map::new();
    map.insert("user".into(), user_val);
    map.insert("token".into(), json!(token));
    if let Value::Object(obj) = extra {
        map.extend(obj);
    }
    ok_json(Value::Object(map))
}

pub fn cors(headers: &mut HeaderMap) {
    headers.insert(
        "access-control-allow-origin",
        HeaderValue::from_static("*"),
    );
    headers.insert(
        "access-control-allow-methods",
        HeaderValue::from_static("GET,POST,PUT,PATCH,DELETE,OPTIONS"),
    );
    headers.insert(
        "access-control-allow-headers",
        HeaderValue::from_static("authorization,content-type,accept"),
    );
}

// SQL fragment to select all user columns (casting enum/numeric types)
pub const USER_COLS: &str = r#"
    id, email, password, google_id, name, handle, avatar, game, game_uid,
    role::TEXT AS role,
    CAST(balance AS FLOAT8) AS balance,
    silver_coins, last_login_date, login_streak, max_streak, paid_matches_played,
    status::TEXT AS status,
    profile_setup, followers_count, following_count,
    instagram, discord, x, youtube, twitch, referral_code, referral_bonus_until,
    daily_task_date, daily_wins, daily_paid_matches, tournament_wins,
    daily_tournament_wins, daily_invite_shared, equipped_frame, equipped_badge,
    equipped_handle_color, is_esports_player, game_ign, trust_score, trust_tier,
    CAST(host_rating_avg AS FLOAT8) AS host_rating_avg,
    host_rating_count, host_badge, bio, ingame_role, profile_animation,
    profile_color, state, city
"#;

pub async fn fetch_user_by_id(pool: &PgPool, id: i32) -> Option<DbUser> {
    let sql = format!("SELECT {} FROM users WHERE id = $1", USER_COLS);
    sqlx::query_as::<_, DbUser>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

async fn fetch_user_by_email(pool: &PgPool, email: &str) -> Option<DbUser> {
    let sql = format!("SELECT {} FROM users WHERE email = $1", USER_COLS);
    sqlx::query_as::<_, DbUser>(&sql)
        .bind(email)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

fn get_bearer(headers: &HeaderMap) -> Option<String> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string())
}

pub async fn auth_user(state: &AppState, headers: &HeaderMap) -> Result<DbUser, Response> {
    let token = get_bearer(headers)
        .ok_or_else(|| err_json(StatusCode::UNAUTHORIZED, "Unauthorized"))?;
    let user_id = verify_jwt(&token, &state.jwt_secret)
        .ok_or_else(|| err_json(StatusCode::UNAUTHORIZED, "Invalid token"))?;
    fetch_user_by_id(&state.pool, user_id)
        .await
        .ok_or_else(|| err_json(StatusCode::UNAUTHORIZED, "User not found"))
}

async fn gift_streak_reward_if_needed(pool: &PgPool, user_id: i32, new_streak: i32) {
    if new_streak != 15 {
        return;
    }
    let already: Option<(i32,)> = sqlx::query_as(
        "SELECT id FROM user_cosmetics WHERE user_id = $1 AND item_id = 'banner-rainfall' LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    if already.is_none() {
        let _ = sqlx::query(
            "INSERT INTO user_cosmetics (user_id, item_id, category) VALUES ($1, 'banner-rainfall', 'banner_animation') ON CONFLICT DO NOTHING",
        )
        .bind(user_id)
        .execute(pool)
        .await;
    }
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

async fn send_register_otp(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SendRegisterOtpBody>,
) -> Response {
    clean_expired_otps(&state.otp_store);

    let email = match body.email.filter(|s| !s.is_empty()) {
        Some(e) => e,
        None => return err_json(StatusCode::BAD_REQUEST, "Email and password required"),
    };
    let password = match body.password.filter(|s| !s.is_empty()) {
        Some(p) => p,
        None => return err_json(StatusCode::BAD_REQUEST, "Email and password required"),
    };
    if password.len() < 6 {
        return err_json(StatusCode::BAD_REQUEST, "Password must be at least 6 characters");
    }

    let email_lower = email.to_lowercase();

    let existing: Option<(i32,)> =
        sqlx::query_as("SELECT id FROM users WHERE email = $1")
            .bind(&email_lower)
            .fetch_optional(&state.pool)
            .await
            .ok()
            .flatten();
    if existing.is_some() {
        return err_json(StatusCode::BAD_REQUEST, "Email already registered");
    }

    if let Some(ref code) = body.referral_code {
        let code = code.trim();
        if !code.is_empty() {
            let found: Option<(i32,)> = sqlx::query_as(
                "SELECT id FROM users WHERE LOWER(referral_code) = LOWER($1)",
            )
            .bind(code)
            .fetch_optional(&state.pool)
            .await
            .ok()
            .flatten();
            if found.is_none() {
                return err_json(StatusCode::BAD_REQUEST, "Invalid referral code");
            }
        }
    }

    let otp = generate_otp();
    let password_hash = hash_password(&password).await;
    let key = otp_key(&email_lower, "register");

    state.otp_store.insert(
        key.clone(),
        OtpEntry {
            otp: otp.clone(),
            expiry: Utc::now().timestamp_millis() + 10 * 60 * 1000,
            attempts: 0,
            otp_type: OtpType::Register,
            pending: Some(PendingReg {
                email: email_lower,
                password_hash,
                referral_code: body.referral_code.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(String::from),
            }),
        },
    );

    match send_otp_email(&email, &otp, "register", &state.gmail_user, &state.gmail_pass).await {
        Ok(_) => ok_json(json!({ "success": true, "message": "OTP sent to your email" })),
        Err(_) => {
            state.otp_store.remove(&key);
            err_json(StatusCode::INTERNAL_SERVER_ERROR, "Failed to send OTP email. Please try again.")
        }
    }
}

async fn verify_register(
    State(state): State<Arc<AppState>>,
    Json(body): Json<VerifyRegisterBody>,
) -> Response {
    let email = match body.email.filter(|s| !s.is_empty()) {
        Some(e) => e,
        None => return err_json(StatusCode::BAD_REQUEST, "Email and OTP required"),
    };
    let otp = match body.otp.filter(|s| !s.is_empty()) {
        Some(o) => o,
        None => return err_json(StatusCode::BAD_REQUEST, "Email and OTP required"),
    };

    let key = otp_key(&email, "register");

    let entry = match state.otp_store.get(&key) {
        Some(e) => e.clone(),
        None => return err_json(StatusCode::BAD_REQUEST, "OTP not found or expired. Please request a new one."),
    };

    if Utc::now().timestamp_millis() > entry.expiry {
        state.otp_store.remove(&key);
        return err_json(StatusCode::BAD_REQUEST, "OTP expired. Please request a new one.");
    }
    if entry.attempts >= 3 {
        state.otp_store.remove(&key);
        return err_json(StatusCode::BAD_REQUEST, "Too many incorrect attempts. Please request a new OTP.");
    }
    if entry.otp != otp.trim() {
        let new_attempts = entry.attempts + 1;
        drop(entry);
        if let Some(mut e) = state.otp_store.get_mut(&key) {
            e.attempts = new_attempts;
        }
        let remaining = 3 - new_attempts;
        if remaining == 0 {
            state.otp_store.remove(&key);
            return err_json(StatusCode::BAD_REQUEST, "Incorrect OTP. OTP has been invalidated after 3 failed attempts.");
        }
        let msg = format!("Incorrect OTP. {} attempt{} remaining.", remaining, if remaining == 1 { "" } else { "s" });
        return err_json(StatusCode::BAD_REQUEST, &msg);
    }

    let pending = match entry.pending.clone() {
        Some(p) => p,
        None => {
            drop(entry);
            state.otp_store.remove(&key);
            return err_json(StatusCode::BAD_REQUEST, "Invalid session. Please try again.");
        }
    };
    drop(entry);
    state.otp_store.remove(&key);

    let existing: Option<(i32,)> =
        sqlx::query_as("SELECT id FROM users WHERE email = $1")
            .bind(&pending.email)
            .fetch_optional(&state.pool)
            .await
            .ok()
            .flatten();
    if existing.is_some() {
        return err_json(StatusCode::BAD_REQUEST, "Email already registered");
    }

    let mut referrer_id: Option<i32> = None;
    if let Some(ref code) = pending.referral_code {
        let found: Option<(i32,)> = sqlx::query_as(
            "SELECT id FROM users WHERE LOWER(referral_code) = LOWER($1)",
        )
        .bind(code)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten();
        referrer_id = found.map(|(id,)| id);
    }

    let (user_id,): (i32,) = sqlx::query_as(
        "INSERT INTO users (email, password, role, status, profile_setup, balance) VALUES ($1,$2,'player','active',false,'0') RETURNING id",
    )
    .bind(&pending.email)
    .bind(&pending.password_hash)
    .fetch_one(&state.pool)
    .await
    .expect("insert user failed");

    let referral_code = format!("Tx-user{:03}", user_id);
    sqlx::query("UPDATE users SET referral_code = $1 WHERE id = $2")
        .bind(&referral_code)
        .bind(user_id)
        .execute(&state.pool)
        .await
        .ok();

    if let Some(ref_id) = referrer_id {
        if ref_id != user_id {
            let _ = sqlx::query(
                "INSERT INTO referrals (referrer_id, referred_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
            )
            .bind(ref_id)
            .bind(user_id)
            .execute(&state.pool)
            .await;

            let today = today_date();
            let already_invited: Option<(String, i32)> = sqlx::query_as(
                "SELECT daily_task_date, daily_invite_shared FROM users WHERE id = $1",
            )
            .bind(ref_id)
            .fetch_optional(&state.pool)
            .await
            .ok()
            .flatten();
            if let Some((task_date, invite_count)) = already_invited {
                let already_shared = task_date == today && invite_count >= 1;
                if !already_shared {
                    let _ = sqlx::query(
                        "UPDATE users SET daily_task_date=$1, daily_invite_shared=1, silver_coins=silver_coins+10 WHERE id=$2",
                    )
                    .bind(&today)
                    .bind(ref_id)
                    .execute(&state.pool)
                    .await;
                }
            }
        }
    }

    let user = fetch_user_by_id(&state.pool, user_id).await.expect("fetch new user failed");
    let token = generate_token(user_id, &state.jwt_secret);
    user_with_token_json(&user, &token, json!({}))
}

async fn forgot_password(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ForgotPasswordBody>,
) -> Response {
    clean_expired_otps(&state.otp_store);

    let email = match body.email.filter(|s| !s.is_empty()) {
        Some(e) => e,
        None => return err_json(StatusCode::BAD_REQUEST, "Email required"),
    };
    let email_lower = email.to_lowercase();

    let user: Option<(i32,)> = sqlx::query_as("SELECT id FROM users WHERE email = $1")
        .bind(&email_lower)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten();

    if user.is_none() {
        return ok_json(json!({ "success": true, "message": "If that email exists, an OTP has been sent" }));
    }

    let otp = generate_otp();
    let key = otp_key(&email_lower, "reset");

    state.otp_store.insert(
        key.clone(),
        OtpEntry {
            otp: otp.clone(),
            expiry: Utc::now().timestamp_millis() + 10 * 60 * 1000,
            attempts: 0,
            otp_type: OtpType::Reset,
            pending: None,
        },
    );

    match send_otp_email(&email, &otp, "reset", &state.gmail_user, &state.gmail_pass).await {
        Ok(_) => ok_json(json!({ "success": true, "message": "OTP sent to your email" })),
        Err(_) => {
            state.otp_store.remove(&key);
            err_json(StatusCode::INTERNAL_SERVER_ERROR, "Failed to send OTP email. Please try again.")
        }
    }
}

async fn verify_reset_otp(
    State(state): State<Arc<AppState>>,
    Json(body): Json<VerifyResetOtpBody>,
) -> Response {
    let email = match body.email.filter(|s| !s.is_empty()) {
        Some(e) => e,
        None => return err_json(StatusCode::BAD_REQUEST, "Email and OTP required"),
    };
    let otp = match body.otp.filter(|s| !s.is_empty()) {
        Some(o) => o,
        None => return err_json(StatusCode::BAD_REQUEST, "Email and OTP required"),
    };

    let key = otp_key(&email, "reset");
    let entry = match state.otp_store.get(&key) {
        Some(e) => e.clone(),
        None => return err_json(StatusCode::BAD_REQUEST, "OTP not found or expired. Please request a new one."),
    };

    if Utc::now().timestamp_millis() > entry.expiry {
        state.otp_store.remove(&key);
        return err_json(StatusCode::BAD_REQUEST, "OTP expired. Please request a new one.");
    }
    if entry.attempts >= 3 {
        state.otp_store.remove(&key);
        return err_json(StatusCode::BAD_REQUEST, "Too many incorrect attempts. Please request a new OTP.");
    }
    if entry.otp != otp.trim() {
        let new_attempts = entry.attempts + 1;
        drop(entry);
        if let Some(mut e) = state.otp_store.get_mut(&key) {
            e.attempts = new_attempts;
        }
        let remaining = 3 - new_attempts;
        if remaining == 0 {
            state.otp_store.remove(&key);
            return err_json(StatusCode::BAD_REQUEST, "Incorrect OTP. OTP has been invalidated after 3 failed attempts.");
        }
        let msg = format!("Incorrect OTP. {} attempt{} remaining.", remaining, if remaining == 1 { "" } else { "s" });
        return err_json(StatusCode::BAD_REQUEST, &msg);
    }
    drop(entry);
    state.otp_store.remove(&key);

    let email_lower = email.to_lowercase();
    let exp = (Utc::now() + Duration::minutes(15)).timestamp() as usize;
    let reset_claims = ResetClaims { email: email_lower, purpose: "reset".to_string(), exp };
    let reset_token = encode(
        &Header::default(),
        &reset_claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .expect("JWT encode failed");

    ok_json(json!({ "success": true, "resetToken": reset_token }))
}

async fn reset_password(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ResetPasswordBody>,
) -> Response {
    let reset_token = match body.reset_token.filter(|s| !s.is_empty()) {
        Some(t) => t,
        None => return err_json(StatusCode::BAD_REQUEST, "Reset token and new password required"),
    };
    let new_password = match body.new_password.filter(|s| !s.is_empty()) {
        Some(p) => p,
        None => return err_json(StatusCode::BAD_REQUEST, "Reset token and new password required"),
    };
    if new_password.len() < 6 {
        return err_json(StatusCode::BAD_REQUEST, "Password must be at least 6 characters");
    }

    let mut validation = Validation::default();
    validation.validate_exp = true;
    let claims = match decode::<ResetClaims>(
        &reset_token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &validation,
    ) {
        Ok(d) => d.claims,
        Err(_) => return err_json(StatusCode::BAD_REQUEST, "Invalid or expired reset token. Please start over."),
    };

    if claims.purpose != "reset" {
        return err_json(StatusCode::BAD_REQUEST, "Invalid reset token.");
    }

    let user = match fetch_user_by_email(&state.pool, &claims.email).await {
        Some(u) => u,
        None => return err_json(StatusCode::NOT_FOUND, "User not found"),
    };

    let password_hash = hash_password(&new_password).await;
    sqlx::query("UPDATE users SET password = $1 WHERE id = $2")
        .bind(&password_hash)
        .bind(user.id)
        .execute(&state.pool)
        .await
        .ok();

    let updated = fetch_user_by_id(&state.pool, user.id).await.expect("fetch user failed");
    let token = generate_token(updated.id, &state.jwt_secret);
    user_with_token_json(&updated, &token, json!({}))
}

async fn login(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LoginBody>,
) -> Response {
    let email = match body.email.filter(|s| !s.is_empty()) {
        Some(e) => e,
        None => return err_json(StatusCode::BAD_REQUEST, "Email and password required"),
    };
    let password = match body.password.filter(|s| !s.is_empty()) {
        Some(p) => p,
        None => return err_json(StatusCode::BAD_REQUEST, "Email and password required"),
    };

    let user = match fetch_user_by_email(&state.pool, &email.to_lowercase()).await {
        Some(u) => u,
        None => return err_json(StatusCode::UNAUTHORIZED, "Invalid email or password"),
    };

    if user.password.is_none() {
        return err_json(
            StatusCode::UNAUTHORIZED,
            "This account uses Google Sign-In. Please use the Continue with Google button.",
        );
    }

    if !verify_password(&password, user.password.as_deref().unwrap_or("")).await {
        return err_json(StatusCode::UNAUTHORIZED, "Invalid email or password");
    }

    let today = today_date();
    let is_first_login_today = user.last_login_date.as_deref() != Some(today.as_str());
    let mut updated_user = user.clone();

    if is_first_login_today {
        let new_streak = compute_new_streak(user.last_login_date.as_deref(), user.login_streak);
        let new_max = new_streak.max(user.max_streak);
        sqlx::query(
            "UPDATE users SET last_login_date=$1, silver_coins=silver_coins+10, login_streak=$2, max_streak=$3 WHERE id=$4",
        )
        .bind(&today)
        .bind(new_streak)
        .bind(new_max)
        .bind(user.id)
        .execute(&state.pool)
        .await
        .ok();

        gift_streak_reward_if_needed(&state.pool, user.id, new_streak).await;
        updated_user = fetch_user_by_id(&state.pool, user.id).await.unwrap_or(user);
    }

    let token = generate_token(updated_user.id, &state.jwt_secret);
    let daily_bonus: i32 = if is_first_login_today { 10 } else { 0 };
    let login_streak = updated_user.login_streak;
    user_with_token_json(&updated_user, &token, json!({
        "dailyLoginBonus": daily_bonus,
        "loginStreak": login_streak,
    }))
}

async fn get_me(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    match auth_user(&state, &headers).await {
        Ok(user) => user_json(&user),
        Err(r) => r,
    }
}

async fn logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    match auth_user(&state, &headers).await {
        Ok(_) => ok_json(json!({ "success": true, "message": "Logged out" })),
        Err(r) => r,
    }
}

async fn daily_checkin(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u,
        Err(r) => return r,
    };

    let today = today_date();
    if user.last_login_date.as_deref() == Some(today.as_str()) {
        return ok_json(json!({
            "claimed": false,
            "bonus": 0,
            "silverCoins": user.silver_coins,
            "loginStreak": user.login_streak,
        }));
    }

    let referral_bonus: i32 = if user.referral_bonus_until.as_deref().map_or(false, |d| d >= today.as_str()) { 1 } else { 0 };
    let total_bonus = 5 + referral_bonus;
    let new_streak = compute_new_streak(user.last_login_date.as_deref(), user.login_streak);
    let new_max = new_streak.max(user.max_streak);

    sqlx::query(
        "UPDATE users SET last_login_date=$1, silver_coins=silver_coins+$2, login_streak=$3, max_streak=$4 WHERE id=$5",
    )
    .bind(&today)
    .bind(total_bonus)
    .bind(new_streak)
    .bind(new_max)
    .bind(user.id)
    .execute(&state.pool)
    .await
    .ok();

    gift_streak_reward_if_needed(&state.pool, user.id, new_streak).await;

    let updated = fetch_user_by_id(&state.pool, user.id).await.unwrap_or(user);
    let streak_reward = if new_streak == 15 { Some("banner-rainfall") } else { None };

    ok_json(json!({
        "claimed": true,
        "bonus": total_bonus,
        "referralBonus": referral_bonus,
        "silverCoins": updated.silver_coins,
        "loginStreak": new_streak,
        "streakReward": streak_reward,
    }))
}

async fn daily_tasks(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u,
        Err(r) => return r,
    };

    let today = today_date();
    let mut daily_wins = user.daily_wins;
    let mut daily_paid = user.daily_paid_matches;
    let mut daily_invite = user.daily_invite_shared;

    if user.daily_task_date.as_deref() != Some(today.as_str()) {
        sqlx::query(
            "UPDATE users SET daily_task_date=$1, daily_wins=0, daily_paid_matches=0, daily_tournament_wins=0, daily_invite_shared=0 WHERE id=$2",
        )
        .bind(&today)
        .bind(user.id)
        .execute(&state.pool)
        .await
        .ok();
        daily_wins = 0;
        daily_paid = 0;
        daily_invite = 0;
    }

    let tournament_wins_today = if user.daily_task_date.as_deref() == Some(today.as_str()) {
        user.daily_tournament_wins
    } else {
        0
    };

    ok_json(json!({
        "loginClaimed": user.last_login_date.as_deref() == Some(today.as_str()),
        "loginStreak": user.login_streak,
        "maxStreak": user.max_streak,
        "freeMatchesToday": daily_wins,
        "freeMatchesClaimed": daily_wins >= 3,
        "paidMatchesToday": daily_paid,
        "paidMatchesClaimed": daily_paid >= 3,
        "tournamentWinsToday": tournament_wins_today,
        "tournamentWinsClaimed": tournament_wins_today >= 5,
        "inviteClaimed": daily_invite >= 1,
    }))
}

async fn setup_profile(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SetupProfileBody>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u,
        Err(r) => return r,
    };

    let name = match body.name.filter(|s| !s.trim().is_empty()) {
        Some(n) => n,
        None => return err_json(StatusCode::BAD_REQUEST, "All fields required"),
    };
    let game = match body.game.filter(|s| !s.trim().is_empty()) {
        Some(g) => g,
        None => return err_json(StatusCode::BAD_REQUEST, "All fields required"),
    };
    let handle = match body.handle.as_deref() {
        Some(h) => {
            let cleaned: String = h
                .to_lowercase()
                .replace(' ', "_")
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
                .collect();
            if cleaned.is_empty() {
                return err_json(StatusCode::BAD_REQUEST, "All fields required");
            }
            cleaned
        }
        None => return err_json(StatusCode::BAD_REQUEST, "All fields required"),
    };

    let existing: Option<(i32,)> =
        sqlx::query_as("SELECT id FROM users WHERE handle = $1")
            .bind(&handle)
            .fetch_optional(&state.pool)
            .await
            .ok()
            .flatten();
    if let Some((existing_id,)) = existing {
        if existing_id != user.id {
            return err_json(StatusCode::BAD_REQUEST, "Handle already taken");
        }
    }

    let avatar = body.avatar.clone().unwrap_or_else(|| "🔥".to_string());
    let referral_code = format!("Tx-{}{:03}", handle, user.id);
    let bonus: i32 = if user.profile_setup { 0 } else { 20 };
    let new_trust = (user.trust_score + bonus).min(1000);
    let new_tier = trust_tier_for_score(new_trust);

    sqlx::query(
        "UPDATE users SET avatar=$1, name=$2, game=$3, handle=$4, referral_code=$5, profile_setup=true, status='active', trust_score=$6, trust_tier=$7 WHERE id=$8",
    )
    .bind(&avatar)
    .bind(&name)
    .bind(&game)
    .bind(&handle)
    .bind(&referral_code)
    .bind(new_trust)
    .bind(new_tier)
    .bind(user.id)
    .execute(&state.pool)
    .await
    .ok();

    if bonus > 0 {
        let _ = sqlx::query(
            "INSERT INTO trust_score_events (user_id, event_type, point_change, reason) VALUES ($1,'profile_completed',$2,'Profile completed')",
        )
        .bind(user.id)
        .bind(bonus)
        .execute(&state.pool)
        .await;
    }

    let updated = fetch_user_by_id(&state.pool, user.id).await.expect("fetch user failed");
    user_json(&updated)
}

async fn update_me(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<UpdateMeBody>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u,
        Err(r) => return r,
    };

    let has_name = body.name.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_some();
    let has_handle = body.handle.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_some();

    if !has_name && !has_handle {
        return err_json(StatusCode::BAD_REQUEST, "Nothing to update");
    }

    if let Some(ref handle_raw) = body.handle {
        let cleaned: String = handle_raw
            .trim()
            .to_lowercase()
            .replace(' ', "_")
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
            .collect();
        if cleaned.is_empty() {
            return err_json(StatusCode::BAD_REQUEST, "Invalid handle");
        }
        let existing: Option<(i32,)> =
            sqlx::query_as("SELECT id FROM users WHERE handle = $1")
                .bind(&cleaned)
                .fetch_optional(&state.pool)
                .await
                .ok()
                .flatten();
        if let Some((eid,)) = existing {
            if eid != user.id {
                return err_json(StatusCode::BAD_REQUEST, "Handle already taken");
            }
        }
        if let Some(ref name_val) = body.name {
            let name_trim = name_val.trim();
            if !name_trim.is_empty() {
                sqlx::query("UPDATE users SET name=$1, handle=$2 WHERE id=$3")
                    .bind(name_trim)
                    .bind(&cleaned)
                    .bind(user.id)
                    .execute(&state.pool)
                    .await
                    .ok();
            } else {
                sqlx::query("UPDATE users SET handle=$1 WHERE id=$2")
                    .bind(&cleaned)
                    .bind(user.id)
                    .execute(&state.pool)
                    .await
                    .ok();
            }
        } else {
            sqlx::query("UPDATE users SET handle=$1 WHERE id=$2")
                .bind(&cleaned)
                .bind(user.id)
                .execute(&state.pool)
                .await
                .ok();
        }
    } else if let Some(ref name_val) = body.name {
        let name_trim = name_val.trim();
        if !name_trim.is_empty() {
            sqlx::query("UPDATE users SET name=$1 WHERE id=$2")
                .bind(name_trim)
                .bind(user.id)
                .execute(&state.pool)
                .await
                .ok();
        }
    }

    let updated = fetch_user_by_id(&state.pool, user.id).await.expect("fetch user failed");
    user_json(&updated)
}

async fn google_auth(_state: State<Arc<AppState>>) -> Response {
    let client_id = match std::env::var("GOOGLE_CLIENT_ID").ok().filter(|s| !s.is_empty()) {
        Some(id) => id,
        None => return err_json(StatusCode::SERVICE_UNAVAILABLE, "Google login is not configured"),
    };
    let base_url = get_app_base_url();
    let redirect_uri = format!("{}/api/auth/google/callback", base_url);
    let params = [
        ("client_id", client_id.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("response_type", "code"),
        ("scope", "openid email profile"),
        ("access_type", "offline"),
        ("prompt", "select_account"),
    ];
    let qs = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding_encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    let url = format!("https://accounts.google.com/o/oauth2/v2/auth?{}", qs);
    axum::response::Redirect::temporary(&url).into_response()
}

async fn google_callback(
    State(state): State<Arc<AppState>>,
    Query(params): Query<GoogleCallbackQuery>,
) -> Response {
    let base_url = get_app_base_url();

    if params.error.is_some() || params.code.is_none() {
        return axum::response::Redirect::temporary(&format!("{}/auth?error=google_cancelled", base_url))
            .into_response();
    }
    let code = params.code.unwrap();

    let client_id = std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default();
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default();
    let redirect_uri = format!("{}/api/auth/google/callback", base_url);

    let token_params = [
        ("code", code.as_str()),
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("grant_type", "authorization_code"),
    ];

    let token_res = match state
        .client
        .post("https://oauth2.googleapis.com/token")
        .form(&token_params)
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => {
            return axum::response::Redirect::temporary(&format!("{}/auth?error=google_failed", base_url))
                .into_response()
        }
    };

    let token_data: serde_json::Value = match token_res.json().await {
        Ok(d) => d,
        Err(_) => {
            return axum::response::Redirect::temporary(&format!("{}/auth?error=google_failed", base_url))
                .into_response()
        }
    };

    let access_token = match token_data["access_token"].as_str() {
        Some(t) => t.to_string(),
        None => {
            return axum::response::Redirect::temporary(&format!("{}/auth?error=google_failed", base_url))
                .into_response()
        }
    };

    let user_info_res = match state
        .client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => {
            return axum::response::Redirect::temporary(&format!("{}/auth?error=google_failed", base_url))
                .into_response()
        }
    };

    let google_user: serde_json::Value = match user_info_res.json().await {
        Ok(d) => d,
        Err(_) => {
            return axum::response::Redirect::temporary(&format!("{}/auth?error=google_failed", base_url))
                .into_response()
        }
    };

    let google_id = match google_user["id"].as_str() {
        Some(id) => id.to_string(),
        None => {
            return axum::response::Redirect::temporary(&format!("{}/auth?error=google_failed", base_url))
                .into_response()
        }
    };
    let email = match google_user["email"].as_str() {
        Some(e) => e.to_lowercase(),
        None => {
            return axum::response::Redirect::temporary(&format!("{}/auth?error=google_no_email", base_url))
                .into_response()
        }
    };
    let name = google_user["name"].as_str().unwrap_or("").to_string();
    let picture = google_user["picture"].as_str().unwrap_or("🔥").to_string();

    let today = today_date();
    let mut daily_bonus: i32 = 0;

    let existing: Option<(i32,)> = sqlx::query_as(
        "SELECT id FROM users WHERE email=$1 OR google_id=$2 LIMIT 1",
    )
    .bind(&email)
    .bind(&google_id)
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten();

    let user_id = if let Some((uid,)) = existing {
        let current = fetch_user_by_id(&state.pool, uid).await;
        if let Some(ref u) = current {
            let mut patches: Vec<String> = Vec::new();
            let mut args_idx = 1i32;
            if u.google_id.is_none() {
                patches.push(format!("google_id=${}", args_idx));
                args_idx += 1;
            }
            let first_today = u.last_login_date.as_deref() != Some(today.as_str());
            if first_today {
                let new_streak = compute_new_streak(u.last_login_date.as_deref(), u.login_streak);
                let new_max = new_streak.max(u.max_streak);
                patches.push(format!("last_login_date=${}", args_idx));
                args_idx += 1;
                patches.push(format!("silver_coins=silver_coins+10"));
                patches.push(format!("login_streak=${}", args_idx));
                args_idx += 1;
                patches.push(format!("max_streak=${}", args_idx));
                args_idx += 1;
                daily_bonus = 10;

                if !patches.is_empty() {
                    let sql = format!("UPDATE users SET {} WHERE id=${}", patches.join(","), args_idx);
                    let mut q = sqlx::query(&sql);
                    if u.google_id.is_none() {
                        q = q.bind(&google_id);
                    }
                    q = q.bind(&today).bind(new_streak).bind(new_max).bind(uid);
                    q.execute(&state.pool).await.ok();
                    if first_today {
                        gift_streak_reward_if_needed(&state.pool, uid, new_streak).await;
                    }
                }
            } else if u.google_id.is_none() {
                sqlx::query("UPDATE users SET google_id=$1 WHERE id=$2")
                    .bind(&google_id)
                    .bind(uid)
                    .execute(&state.pool)
                    .await
                    .ok();
            }
        }
        uid
    } else {
        let referral_code: String = {
            let mut rng = rand::thread_rng();
            let chars = "abcdefghijklmnopqrstuvwxyz0123456789";
            (0..6).map(|_| {
                let idx = rng.gen_range(0..chars.len());
                chars.chars().nth(idx).unwrap()
            }).collect::<String>().to_uppercase()
        };
        let (uid,): (i32,) = sqlx::query_as(
            "INSERT INTO users (email, name, avatar, google_id, role, status, last_login_date, referral_code, silver_coins) VALUES ($1,$2,$3,$4,'player','active',$5,$6,10) RETURNING id",
        )
        .bind(&email)
        .bind(if name.is_empty() { email.split('@').next().unwrap_or("").to_string() } else { name })
        .bind(&picture)
        .bind(&google_id)
        .bind(&today)
        .bind(&referral_code)
        .fetch_one(&state.pool)
        .await
        .expect("insert google user failed");
        daily_bonus = 10;
        uid
    };

    let token = generate_token(user_id, &state.jwt_secret);
    let mut qs_params = format!("token={}", urlencoding_encode(&token));
    if daily_bonus > 0 {
        qs_params.push_str(&format!("&dailyBonus={}", daily_bonus));
    }
    axum::response::Redirect::temporary(&format!("{}/auth/callback?{}", base_url, qs_params))
        .into_response()
}

fn get_app_base_url() -> String {
    if let Ok(url) = std::env::var("APP_URL") {
        return url;
    }
    if let Ok(domain) = std::env::var("REPLIT_DEV_DOMAIN") {
        return format!("https://{}", domain);
    }
    "http://localhost:3000".to_string()
}

fn urlencoding_encode(s: &str) -> String {
    s.chars()
        .flat_map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '~' {
                vec![c]
            } else {
                let encoded = format!("%{:02X}", c as u8);
                encoded.chars().collect()
            }
        })
        .collect()
}

// ─── Router ───────────────────────────────────────────────────────────────────

pub fn auth_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/auth/send-register-otp", post(send_register_otp))
        .route("/auth/verify-register", post(verify_register))
        .route("/auth/forgot-password", post(forgot_password))
        .route("/auth/verify-reset-otp", post(verify_reset_otp))
        .route("/auth/reset-password", post(reset_password))
        .route("/auth/login", post(login))
        .route("/auth/me", get(get_me).patch(update_me))
        .route("/auth/logout", post(logout))
        .route("/auth/daily-checkin", post(daily_checkin))
        .route("/auth/daily-tasks", get(daily_tasks))
        .route("/auth/setup-profile", post(setup_profile))
        .route("/auth/google", get(google_auth))
        .route("/auth/google/callback", get(google_callback))
}

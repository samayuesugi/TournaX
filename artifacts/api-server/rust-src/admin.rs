use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::{collections::HashMap, sync::Arc};

use crate::AppState;
use crate::auth::{auth_user, err_json, ok_json};

// ─── Platform Settings ────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PlatformSettings {
    #[serde(default = "default_fee")]
    platform_fee_percent: f64,
    #[serde(default)]
    store_price_overrides: HashMap<String, i32>,
    #[serde(default)]
    featured_player_ids: Vec<i32>,
}

fn default_fee() -> f64 { 5.0 }

impl Default for PlatformSettings {
    fn default() -> Self {
        Self {
            platform_fee_percent: 5.0,
            store_price_overrides: HashMap::new(),
            featured_player_ids: Vec::new(),
        }
    }
}

fn get_settings() -> PlatformSettings {
    if let Ok(content) = std::fs::read_to_string("platform-settings.json") {
        if let Ok(s) = serde_json::from_str::<PlatformSettings>(&content) {
            return s;
        }
    }
    PlatformSettings::default()
}

fn save_settings(s: &PlatformSettings) {
    if let Ok(content) = serde_json::to_string_pretty(s) {
        let _ = std::fs::write("platform-settings.json", content);
    }
}

// ─── Store Items ──────────────────────────────────────────────────────────────

struct StoreItem {
    id: &'static str,
    category: &'static str,
    name: &'static str,
    description: &'static str,
    emoji: &'static str,
    cost: i32,
    css_value: &'static str,
}

static STORE_ITEMS: &[StoreItem] = &[
    StoreItem { id: "frame-fire",    category: "frame", name: "Fire Ring",    description: "Burn bright with a blazing orange frame",   emoji: "🔥", cost: 50,  css_value: "ring-2 ring-orange-500 ring-offset-2 ring-offset-background" },
    StoreItem { id: "frame-galaxy",  category: "frame", name: "Galaxy Ring",  description: "Mysterious cosmic purple-blue border",       emoji: "🌌", cost: 80,  css_value: "ring-2 ring-purple-500 ring-offset-2 ring-offset-background" },
    StoreItem { id: "frame-gold",    category: "frame", name: "Gold Ring",    description: "Show off your status with gleaming gold",    emoji: "✨", cost: 100, css_value: "ring-2 ring-amber-400 ring-offset-2 ring-offset-background" },
    StoreItem { id: "frame-neon",    category: "frame", name: "Neon Ring",    description: "Electric cyan glow that stands out",         emoji: "⚡", cost: 120, css_value: "ring-2 ring-cyan-400 ring-offset-2 ring-offset-background" },
    StoreItem { id: "frame-legend",  category: "frame", name: "Legend Aura",  description: "Red champion aura for true legends",         emoji: "👑", cost: 200, css_value: "ring-2 ring-red-500 ring-offset-2 ring-offset-background shadow-[0_0_12px_2px_rgba(239,68,68,0.5)]" },
    StoreItem { id: "badge-warrior",  category: "badge", name: "Warrior",  description: "For those who never back down",          emoji: "⚔️", cost: 30,  css_value: "⚔️" },
    StoreItem { id: "badge-ghost",    category: "badge", name: "Ghost",    description: "Silent, deadly — impossible to catch",   emoji: "👻", cost: 40,  css_value: "👻" },
    StoreItem { id: "badge-champion", category: "badge", name: "Champion", description: "Proven winner across multiple tourneys", emoji: "🏆", cost: 60,  css_value: "🏆" },
    StoreItem { id: "badge-dragon",   category: "badge", name: "Dragon",   description: "Rare prestige badge for elite players",  emoji: "🐲", cost: 80,  css_value: "🐲" },
    StoreItem { id: "badge-legend",   category: "badge", name: "Legend",   description: "The highest badge — for the chosen few", emoji: "👑", cost: 100, css_value: "👑" },
    StoreItem { id: "color-purple", category: "handle_color", name: "Purple", description: "Vibrant royal purple handle",   emoji: "💜", cost: 40,  css_value: "text-purple-400" },
    StoreItem { id: "color-red",    category: "handle_color", name: "Red",    description: "Bold danger-red handle",        emoji: "❤️", cost: 50,  css_value: "text-red-400" },
    StoreItem { id: "color-green",  category: "handle_color", name: "Green",  description: "Toxic neon-green handle",       emoji: "💚", cost: 50,  css_value: "text-green-400" },
    StoreItem { id: "color-cyan",   category: "handle_color", name: "Cyan",   description: "Ice-cold electric cyan handle", emoji: "🩵", cost: 60,  css_value: "text-cyan-400" },
    StoreItem { id: "color-gold",   category: "handle_color", name: "Gold",   description: "Prestigious gold handle color", emoji: "💛", cost: 70,  css_value: "text-amber-400" },
    StoreItem { id: "banner-rainfall",    category: "banner_animation", name: "Rain",            description: "Realistic water rain drops falling across your banner",       emoji: "🌧️", cost: 90,  css_value: "rainfall" },
    StoreItem { id: "banner-firestorm",   category: "banner_animation", name: "Firestorm",       description: "Blazing fire waves and ember particles for your banner",      emoji: "🔥", cost: 120, css_value: "firestorm" },
    StoreItem { id: "banner-star-night",  category: "banner_animation", name: "Starry Snowfall", description: "Galaxy night sky with drifting snow and stars",             emoji: "🌌", cost: 140, css_value: "star-night" },
    StoreItem { id: "banner-night-stars", category: "banner_animation", name: "Night Stars",     description: "Deep night sky with twinkling stars shimmering across your banner", emoji: "⭐", cost: 150, css_value: "night-stars" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async fn auth_admin(state: &AppState, headers: &HeaderMap) -> Result<crate::auth::DbUser, Response> {
    let user = auth_user(state, headers).await?;
    if user.role != "admin" {
        return Err(err_json(StatusCode::FORBIDDEN, "Admin access required"));
    }
    Ok(user)
}

async fn notify(pool: &PgPool, user_id: i32, ntype: &str, message: &str) {
    let _ = sqlx::query(
        "INSERT INTO notifications (user_id, type, message, read) VALUES ($1, $2, $3, false)"
    )
    .bind(user_id).bind(ntype).bind(message)
    .execute(pool).await;
}

fn trust_tier(score: i32) -> &'static str {
    if score < 300 { "Risky" } else if score < 500 { "Beginner" } else if score < 700 { "Trusted" } else if score < 900 { "Veteran" } else { "Elite" }
}

fn val_to_f64(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

// ─── Router ───────────────────────────────────────────────────────────────────

pub fn admin_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/admin/dashboard",                         get(admin_dashboard))
        .route("/admin/players",                           get(list_players))
        .route("/admin/players/:id/verify",                post(verify_player))
        .route("/admin/players/:id/ban",                   post(ban_player))
        .route("/admin/players/:id/unban",                 post(unban_player))
        .route("/admin/players/:id",                       delete(delete_player))
        .route("/admin/players/:id/add-balance",           post(add_player_balance))
        .route("/admin/players/:id/set-balance",           post(set_player_balance))
        .route("/admin/banned",                            get(list_banned))
        .route("/admin/finance/add-requests",              get(list_add_requests))
        .route("/admin/finance/add-requests/:id/approve",  post(approve_add_request))
        .route("/admin/finance/add-requests/:id/reject",   post(reject_add_request))
        .route("/admin/finance/withdrawals",               get(list_withdrawals))
        .route("/admin/finance/withdrawals/:id/approve",   post(approve_withdrawal))
        .route("/admin/finance/withdrawals/:id/reject",    post(reject_withdrawal))
        .route("/admin/platform-earnings",                 get(list_platform_earnings).delete(clear_platform_earnings))
        .route("/admin/earnings",                          get(earnings_analytics))
        .route("/admin/create-host",                       post(create_host))
        .route("/admin/create-admin",                      post(create_admin_user))
        .route("/admin/hosts-list",                        get(list_hosts))
        .route("/admin/hosts/:id/status",                  patch(update_host_status))
        .route("/admin/hosts/:id/recommend",               patch(toggle_host_recommend))
        .route("/admin/hosts/:id",                         delete(delete_host))
        .route("/admin/matches/:id",                       delete(admin_delete_match))
        .route("/admin/broadcast",                         post(broadcast))
        .route("/admin/complaints",                        get(list_complaints))
        .route("/admin/referrals",                         get(list_referrals))
        .route("/admin/leaderboard-ctrl",                  get(leaderboard_ctrl))
        .route("/admin/leaderboard-ctrl/feature/:id",      post(toggle_feature_player))
        .route("/admin/leaderboard-ctrl/reset",            post(reset_featured))
        .route("/admin/store",                             get(admin_store))
        .route("/admin/store/:id/price",                   patch(set_store_price))
        .route("/admin/settings",                          get(get_settings_route).post(update_settings))
        .route("/admin/host-applications",                 get(list_host_applications))
        .route("/admin/host-applications/:id/approve",     patch(approve_host_application))
        .route("/admin/host-applications/:id/reject",      patch(reject_host_application))
        .route("/host-applications",                       post(submit_host_application))
        .route("/host-applications/my",                    get(my_host_application))
}

// ─── GET /admin/dashboard ─────────────────────────────────────────────────────

async fn admin_dashboard(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let pool = &state.pool;

    let total_players: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'player'").fetch_one(pool).await.unwrap_or(0);
    let active_players: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'player' AND status = 'active'").fetch_one(pool).await.unwrap_or(0);
    let pending_kyc: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'player' AND status = 'pending'").fetch_one(pool).await.unwrap_or(0);
    let hosts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'host'").fetch_one(pool).await.unwrap_or(0);
    let total_matches: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM matches").fetch_one(pool).await.unwrap_or(0);
    let live_now: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM matches WHERE status::TEXT = 'live'").fetch_one(pool).await.unwrap_or(0);
    let pending_withdrawals: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'pending'").fetch_one(pool).await.unwrap_or(0);
    let complaints_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM complaints").fetch_one(pool).await.unwrap_or(0);

    let revenue: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(SUM(CAST(entry_fee AS FLOAT8) * filled_slots) AS FLOAT8) FROM matches WHERE status::TEXT = 'completed'"
    ).fetch_one(pool).await.unwrap_or(None);
    let platform_fees: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(SUM(CAST(amount AS FLOAT8)) AS FLOAT8) FROM platform_earnings"
    ).fetch_one(pool).await.unwrap_or(None);

    #[derive(sqlx::FromRow)]
    struct AdminRow { id: i32, email: String, name: Option<String>, role: String }
    let admins: Vec<AdminRow> = sqlx::query_as(
        "SELECT id, email, name, role FROM users WHERE role = 'admin'"
    ).fetch_all(pool).await.unwrap_or_default();

    #[derive(sqlx::FromRow)]
    struct FlaggedPlayer { id: i32, email: String, name: Option<String>, handle: Option<String>, trust_score: i32, trust_tier: String, status: String }
    let flagged_players: Vec<FlaggedPlayer> = sqlx::query_as(
        "SELECT id, email, name, handle, trust_score, trust_tier, status FROM users WHERE role = 'player' AND (trust_score < 300 OR status = 'banned')"
    ).fetch_all(pool).await.unwrap_or_default();

    #[derive(sqlx::FromRow)]
    struct FlaggedHost { id: i32, email: String, name: Option<String>, handle: Option<String>, host_rating_avg: f64, host_rating_count: i32, host_badge: String }
    let flagged_hosts: Vec<FlaggedHost> = sqlx::query_as(
        "SELECT id, email, name, handle, CAST(host_rating_avg AS FLOAT8) AS host_rating_avg, host_rating_count, host_badge FROM users WHERE role = 'host' AND host_badge = 'Flagged Host'"
    ).fetch_all(pool).await.unwrap_or_default();

    #[derive(sqlx::FromRow)]
    struct HostRow { id: i32, email: String, name: Option<String>, role: String, game: Option<String>, recommended: bool, host_rating_avg: f64, host_rating_count: i32, host_badge: String }
    let host_list: Vec<HostRow> = sqlx::query_as(
        "SELECT id, email, name, role, game, COALESCE(recommended, false) AS recommended, CAST(host_rating_avg AS FLOAT8) AS host_rating_avg, host_rating_count, host_badge FROM users WHERE role = 'host'"
    ).fetch_all(pool).await.unwrap_or_default();

    ok_json(json!({
        "totalPlayers": total_players,
        "activePlayers": active_players,
        "pendingKyc": pending_kyc,
        "hosts": hosts,
        "totalMatches": total_matches,
        "liveNow": live_now,
        "pendingWithdrawals": pending_withdrawals,
        "totalRevenue": revenue.unwrap_or(0.0),
        "platformFees": platform_fees.unwrap_or(0.0),
        "complaintsCount": complaints_count,
        "adminList": admins.iter().map(|a| json!({ "id": a.id, "email": a.email, "name": a.name, "role": a.role })).collect::<Vec<_>>(),
        "flaggedPlayers": flagged_players.iter().map(|p| json!({ "id": p.id, "email": p.email, "name": p.name, "handle": p.handle, "trustScore": p.trust_score, "trustTier": p.trust_tier, "status": p.status })).collect::<Vec<_>>(),
        "flaggedHosts": flagged_hosts.iter().map(|h| json!({ "id": h.id, "email": h.email, "name": h.name, "handle": h.handle, "hostRatingAvg": h.host_rating_avg, "hostRatingCount": h.host_rating_count, "hostBadge": h.host_badge })).collect::<Vec<_>>(),
        "hostList": host_list.iter().map(|h| json!({ "id": h.id, "email": h.email, "name": h.name, "role": h.role, "game": h.game, "recommended": h.recommended, "hostRatingAvg": h.host_rating_avg, "hostRatingCount": h.host_rating_count, "hostBadge": h.host_badge })).collect::<Vec<_>>(),
    }))
}

// ─── GET /admin/players ───────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PlayersQuery { search: Option<String>, status: Option<String> }

async fn list_players(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<PlayersQuery>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct PlayerRow { id: i32, name: Option<String>, email: String, game_uid: Option<String>, handle: Option<String>, balance: f64, status: String, match_count: i64 }

    let mut wheres = vec!["u.role = 'player'".to_string()];
    let mut params: Vec<String> = vec![];
    let mut idx = 1usize;

    if let Some(ref s) = q.status {
        if s != "all" {
            wheres.push(format!("u.status = ${}", idx));
            params.push(s.clone()); idx += 1;
        }
    }
    if let Some(ref search) = q.search {
        wheres.push(format!("(u.name ILIKE ${0} OR u.email ILIKE ${0} OR u.game_uid ILIKE ${0})", idx));
        params.push(format!("%{}%", search)); idx += 1;
    }
    let _ = idx;

    let sql = format!(
        "SELECT u.id, u.name, u.email, u.game_uid, u.handle, CAST(u.balance AS FLOAT8) AS balance, u.status, COUNT(mp.id) AS match_count FROM users u LEFT JOIN match_participants mp ON mp.user_id = u.id WHERE {} GROUP BY u.id ORDER BY u.id",
        wheres.join(" AND ")
    );

    let mut qb = sqlx::query_as::<_, PlayerRow>(&sql);
    for p in &params { qb = qb.bind(p); }
    let rows = qb.fetch_all(&state.pool).await.unwrap_or_default();

    let result: Vec<Value> = rows.iter().map(|p| json!({
        "id": p.id, "name": p.name, "email": p.email, "uid": p.game_uid,
        "handle": p.handle, "balance": p.balance, "status": p.status, "matchesPlayed": p.match_count,
    })).collect();
    ok_json(json!(result))
}

// ─── POST /admin/players/:id/verify ──────────────────────────────────────────

async fn verify_player(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let _ = sqlx::query("UPDATE users SET status = 'active' WHERE id = $1")
        .bind(id).execute(&state.pool).await;
    ok_json(json!({ "success": true }))
}

// ─── POST /admin/players/:id/ban ─────────────────────────────────────────────

async fn ban_player(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let current: Option<i32> = sqlx::query_scalar("SELECT trust_score FROM users WHERE id = $1")
        .bind(id).fetch_optional(&state.pool).await.unwrap_or(None).flatten();
    let next_score = (current.unwrap_or(500) - 200).clamp(0, 1000);
    let tier = trust_tier(next_score);
    let _ = sqlx::query("UPDATE users SET status = 'banned', trust_score = $1, trust_tier = $2 WHERE id = $3")
        .bind(next_score).bind(tier).bind(id).execute(&state.pool).await;
    let _ = sqlx::query(
        "INSERT INTO trust_score_events (user_id, event_type, point_change, reason) VALUES ($1, 'admin_ban', -200, 'Banned by admin')"
    ).bind(id).execute(&state.pool).await;
    ok_json(json!({ "success": true }))
}

// ─── POST /admin/players/:id/unban ───────────────────────────────────────────

async fn unban_player(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let _ = sqlx::query("UPDATE users SET status = 'active' WHERE id = $1")
        .bind(id).execute(&state.pool).await;
    ok_json(json!({ "success": true }))
}

// ─── DELETE /admin/players/:id ────────────────────────────────────────────────

async fn delete_player(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = $1")
        .bind(id).fetch_optional(&state.pool).await.unwrap_or(None).flatten();
    match role.as_deref() {
        None => return err_json(StatusCode::NOT_FOUND, "Player not found"),
        Some(r) if r != "player" => return err_json(StatusCode::BAD_REQUEST, "Only player accounts can be deleted"),
        _ => {}
    }
    let _ = sqlx::query("DELETE FROM users WHERE id = $1").bind(id).execute(&state.pool).await;
    ok_json(json!({ "success": true }))
}

// ─── POST /admin/players/:id/add-balance ──────────────────────────────────────

async fn add_player_balance(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<Value>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let amount = match val_to_f64(body.get("amount").unwrap_or(&Value::Null)) {
        Some(a) if a > 0.0 => a,
        _ => return err_json(StatusCode::BAD_REQUEST, "Invalid amount"),
    };
    let _ = sqlx::query("UPDATE users SET balance = balance + $1 WHERE id = $2")
        .bind(amount).bind(id).execute(&state.pool).await;
    ok_json(json!({ "success": true }))
}

// ─── POST /admin/players/:id/set-balance ──────────────────────────────────────

async fn set_player_balance(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<Value>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let amount = match val_to_f64(body.get("amount").unwrap_or(&Value::Null)) {
        Some(a) if a >= 0.0 => a,
        _ => return err_json(StatusCode::BAD_REQUEST, "Invalid amount"),
    };
    let _ = sqlx::query("UPDATE users SET balance = $1 WHERE id = $2")
        .bind(amount).bind(id).execute(&state.pool).await;
    ok_json(json!({ "success": true }))
}

// ─── GET /admin/banned ────────────────────────────────────────────────────────

async fn list_banned(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct BannedRow { id: i32, name: Option<String>, email: String, handle: Option<String>, avatar: Option<String>, role: String, trust_score: i32, created_at: Option<chrono::DateTime<chrono::Utc>> }
    let rows: Vec<BannedRow> = sqlx::query_as(
        "SELECT id, name, email, handle, avatar, role, trust_score, created_at FROM users WHERE status = 'banned' ORDER BY created_at DESC"
    ).fetch_all(&state.pool).await.unwrap_or_default();

    ok_json(json!(rows.iter().map(|u| json!({
        "id": u.id, "name": u.name, "email": u.email, "handle": u.handle,
        "avatar": u.avatar, "role": u.role, "trustScore": u.trust_score,
        "createdAt": u.created_at.map(|t| t.to_rfc3339()),
    })).collect::<Vec<_>>()))
}

// ─── GET /admin/finance/add-requests ─────────────────────────────────────────

#[derive(Deserialize)]
struct StatusQuery { status: Option<String> }

async fn list_add_requests(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<StatusQuery>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    let mut sql = "SELECT r.id, r.user_id, r.status, CAST(r.amount AS FLOAT8) AS amount, r.utr_number, r.receipt_url, r.created_at, u.name AS user_name, u.email AS user_email FROM add_balance_requests r LEFT JOIN users u ON u.id = r.user_id".to_string();
    if let Some(ref s) = q.status { if s != "all" { sql.push_str(&format!(" WHERE r.status = '{}'", s.replace('\'', "''"))); } }
    sql.push_str(" ORDER BY r.created_at DESC");

    #[derive(sqlx::FromRow)]
    struct Row { id: i32, user_id: i32, status: String, amount: f64, utr_number: Option<String>, receipt_url: Option<String>, created_at: Option<chrono::DateTime<chrono::Utc>>, user_name: Option<String>, user_email: Option<String> }
    let rows: Vec<Row> = sqlx::query_as(&sql).fetch_all(&state.pool).await.unwrap_or_default();

    ok_json(json!(rows.iter().map(|r| json!({
        "id": r.id, "userId": r.user_id, "userName": r.user_name.as_deref().or(r.user_email.as_deref()),
        "userEmail": r.user_email, "amount": r.amount, "status": r.status,
        "utrNumber": r.utr_number, "receiptUrl": r.receipt_url,
        "createdAt": r.created_at.map(|t| t.to_rfc3339()),
    })).collect::<Vec<_>>()))
}

// ─── POST /admin/finance/add-requests/:id/approve ────────────────────────────

async fn approve_add_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct Req { user_id: i32, status: String, amount: f64 }
    let req: Option<Req> = sqlx::query_as(
        "SELECT user_id, status, CAST(amount AS FLOAT8) AS amount FROM add_balance_requests WHERE id = $1"
    ).bind(id).fetch_optional(&state.pool).await.unwrap_or(None);

    let Some(req) = req else { return err_json(StatusCode::NOT_FOUND, "Request not found"); };
    if req.status != "pending" { return err_json(StatusCode::BAD_REQUEST, "Request has already been processed"); }
    if req.amount <= 0.0 { return err_json(StatusCode::BAD_REQUEST, "Invalid request amount"); }

    let _ = sqlx::query("UPDATE add_balance_requests SET status = 'approved' WHERE id = $1").bind(id).execute(&state.pool).await;
    let _ = sqlx::query("UPDATE users SET balance = balance + $1 WHERE id = $2").bind(req.amount).bind(req.user_id).execute(&state.pool).await;

    let pool = state.pool.clone();
    let uid = req.user_id;
    let amt = req.amount;
    tokio::spawn(async move {
        notify(&pool, uid, "balance_approved", &format!("Your deposit of ₹{:.0} has been approved! 💰", amt)).await;
    });
    ok_json(json!({ "success": true }))
}

// ─── POST /admin/finance/add-requests/:id/reject ─────────────────────────────

async fn reject_add_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct Req { user_id: i32, amount: f64 }
    let req: Option<Req> = sqlx::query_as(
        "SELECT user_id, CAST(amount AS FLOAT8) AS amount FROM add_balance_requests WHERE id = $1"
    ).bind(id).fetch_optional(&state.pool).await.unwrap_or(None);

    let _ = sqlx::query("UPDATE add_balance_requests SET status = 'rejected' WHERE id = $1").bind(id).execute(&state.pool).await;

    if let Some(req) = req {
        let pool = state.pool.clone();
        let uid = req.user_id; let amt = req.amount;
        tokio::spawn(async move {
            notify(&pool, uid, "balance_rejected", &format!("Your deposit request of ₹{:.0} was rejected. Contact support for help.", amt)).await;
        });
    }
    ok_json(json!({ "success": true }))
}

// ─── GET /admin/finance/withdrawals ──────────────────────────────────────────

async fn list_withdrawals(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<StatusQuery>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    let mut sql = "SELECT r.id, r.user_id, r.status, CAST(r.amount AS FLOAT8) AS amount, r.upi_id, r.created_at, u.name AS user_name, u.email AS user_email FROM withdrawal_requests r LEFT JOIN users u ON u.id = r.user_id".to_string();
    if let Some(ref s) = q.status { if s != "all" { sql.push_str(&format!(" WHERE r.status = '{}'", s.replace('\'', "''"))); } }
    sql.push_str(" ORDER BY r.created_at DESC");

    #[derive(sqlx::FromRow)]
    struct Row { id: i32, user_id: i32, status: String, amount: f64, upi_id: Option<String>, created_at: Option<chrono::DateTime<chrono::Utc>>, user_name: Option<String>, user_email: Option<String> }
    let rows: Vec<Row> = sqlx::query_as(&sql).fetch_all(&state.pool).await.unwrap_or_default();

    ok_json(json!(rows.iter().map(|r| json!({
        "id": r.id, "userId": r.user_id, "userName": r.user_name.as_deref().or(r.user_email.as_deref()),
        "userEmail": r.user_email, "amount": r.amount, "status": r.status,
        "upiId": r.upi_id, "createdAt": r.created_at.map(|t| t.to_rfc3339()),
    })).collect::<Vec<_>>()))
}

// ─── POST /admin/finance/withdrawals/:id/approve ──────────────────────────────

async fn approve_withdrawal(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct Req { user_id: i32, status: String, amount: f64 }
    let req: Option<Req> = sqlx::query_as(
        "SELECT user_id, status, CAST(amount AS FLOAT8) AS amount FROM withdrawal_requests WHERE id = $1"
    ).bind(id).fetch_optional(&state.pool).await.unwrap_or(None);

    let Some(req) = req else { return err_json(StatusCode::NOT_FOUND, "Not found"); };
    if req.status != "pending" { return err_json(StatusCode::BAD_REQUEST, "Request has already been processed"); }

    let _ = sqlx::query("UPDATE withdrawal_requests SET status = 'approved' WHERE id = $1").bind(id).execute(&state.pool).await;

    let pool = state.pool.clone();
    let uid = req.user_id; let amt = req.amount;
    tokio::spawn(async move {
        notify(&pool, uid, "withdrawal_approved", &format!("Your withdrawal of ₹{:.0} has been approved and sent to your UPI! 🎉", amt)).await;
    });
    ok_json(json!({ "success": true }))
}

// ─── POST /admin/finance/withdrawals/:id/reject ───────────────────────────────

async fn reject_withdrawal(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct Req { user_id: i32, status: String, amount: f64 }
    let req: Option<Req> = sqlx::query_as(
        "SELECT user_id, status, CAST(amount AS FLOAT8) AS amount FROM withdrawal_requests WHERE id = $1"
    ).bind(id).fetch_optional(&state.pool).await.unwrap_or(None);

    let Some(req) = req else { return err_json(StatusCode::NOT_FOUND, "Not found"); };
    if req.status != "pending" { return err_json(StatusCode::BAD_REQUEST, "Request has already been processed"); }
    if req.amount <= 0.0 { return err_json(StatusCode::BAD_REQUEST, "Invalid request amount"); }

    let _ = sqlx::query("UPDATE withdrawal_requests SET status = 'rejected' WHERE id = $1").bind(id).execute(&state.pool).await;
    let _ = sqlx::query("UPDATE users SET balance = balance + $1 WHERE id = $2").bind(req.amount).bind(req.user_id).execute(&state.pool).await;

    let pool = state.pool.clone();
    let uid = req.user_id; let amt = req.amount;
    tokio::spawn(async move {
        notify(&pool, uid, "withdrawal_rejected", &format!("Your withdrawal of ₹{:.0} was rejected. The amount has been returned to your wallet.", amt)).await;
    });
    ok_json(json!({ "success": true }))
}

// ─── GET /admin/platform-earnings ────────────────────────────────────────────

async fn list_platform_earnings(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct Row { id: i32, match_code: String, amount: f64, created_at: Option<chrono::DateTime<chrono::Utc>>, host_name: Option<String>, host_handle: Option<String> }
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT pe.id, pe.match_code, CAST(pe.amount AS FLOAT8) AS amount, pe.created_at, u.name AS host_name, u.handle AS host_handle FROM platform_earnings pe LEFT JOIN users u ON u.id = pe.host_id ORDER BY pe.created_at"
    ).fetch_all(&state.pool).await.unwrap_or_default();

    let total: f64 = rows.iter().map(|r| r.amount).sum();
    let earnings: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.id, "matchCode": r.match_code, "amount": r.amount,
        "createdAt": r.created_at.map(|t| t.to_rfc3339()),
        "hostName": r.host_name.as_deref().unwrap_or("Unknown Host"),
        "hostHandle": r.host_handle,
    })).collect();
    ok_json(json!({ "earnings": earnings, "total": format!("{:.2}", total) }))
}

// ─── DELETE /admin/platform-earnings ─────────────────────────────────────────

async fn clear_platform_earnings(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let _ = sqlx::query("DELETE FROM platform_earnings").execute(&state.pool).await;
    ok_json(json!({ "success": true }))
}

// ─── GET /admin/earnings ──────────────────────────────────────────────────────

async fn earnings_analytics(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct Row { id: i32, match_id: i32, match_code: String, amount: f64, created_at: Option<chrono::DateTime<chrono::Utc>>, game: Option<String> }
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT pe.id, pe.match_id, pe.match_code, CAST(pe.amount AS FLOAT8) AS amount, pe.created_at, m.game FROM platform_earnings pe LEFT JOIN matches m ON m.id = pe.match_id ORDER BY pe.created_at DESC"
    ).fetch_all(&state.pool).await.unwrap_or_default();

    let now = chrono::Utc::now();
    let thirty_ago = now - chrono::Duration::days(30);
    let seven_ago = now - chrono::Duration::days(7);
    use chrono::Datelike;
    let start_of_month = chrono::Utc::now().with_day(1).unwrap_or(now);

    let total_all_time: f64 = rows.iter().map(|r| r.amount).sum();
    let total_last30: f64 = rows.iter().filter(|r| r.created_at.map(|t| t >= thirty_ago).unwrap_or(false)).map(|r| r.amount).sum();
    let total_last7: f64 = rows.iter().filter(|r| r.created_at.map(|t| t >= seven_ago).unwrap_or(false)).map(|r| r.amount).sum();
    let total_this_month: f64 = rows.iter().filter(|r| r.created_at.map(|t| t >= start_of_month).unwrap_or(false)).map(|r| r.amount).sum();

    let mut daily_map: std::collections::BTreeMap<String, f64> = std::collections::BTreeMap::new();
    for i in (0..30).rev() {
        let d = now - chrono::Duration::days(i);
        daily_map.insert(d.format("%Y-%m-%d").to_string(), 0.0);
    }
    for r in rows.iter().filter(|r| r.created_at.map(|t| t >= thirty_ago).unwrap_or(false)) {
        if let Some(t) = r.created_at {
            let day = t.format("%Y-%m-%d").to_string();
            *daily_map.entry(day).or_insert(0.0) += r.amount;
        }
    }
    let daily_breakdown: Vec<Value> = daily_map.into_iter().map(|(date, amount)| json!({ "date": date, "amount": amount })).collect();

    let mut game_map: HashMap<String, f64> = HashMap::new();
    for r in &rows {
        let game = r.game.as_deref().unwrap_or("Unknown").to_string();
        *game_map.entry(game).or_insert(0.0) += r.amount;
    }
    let mut by_game: Vec<Value> = game_map.into_iter().map(|(game, amount)| json!({ "game": game, "amount": amount })).collect();
    by_game.sort_by(|a, b| b["amount"].as_f64().unwrap_or(0.0).partial_cmp(&a["amount"].as_f64().unwrap_or(0.0)).unwrap_or(std::cmp::Ordering::Equal));

    let recent: Vec<Value> = rows.iter().take(30).map(|r| json!({
        "id": r.id, "matchId": r.match_id, "matchCode": r.match_code,
        "amount": r.amount, "createdAt": r.created_at.map(|t| t.to_rfc3339()),
    })).collect();

    ok_json(json!({ "totalAllTime": total_all_time, "totalLast30": total_last30, "totalLast7": total_last7, "totalThisMonth": total_this_month, "dailyBreakdown": daily_breakdown, "byGame": by_game, "recentEarnings": recent }))
}

// ─── POST /admin/create-host ──────────────────────────────────────────────────

#[derive(Deserialize)]
struct CreateHostBody { email: Option<String>, password: Option<String>, name: Option<String>, game: Option<String> }

async fn create_host(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateHostBody>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    let email = match body.email.as_deref() {
        Some(e) if !e.is_empty() => e.to_lowercase(),
        _ => return err_json(StatusCode::BAD_REQUEST, "Email is required"),
    };
    let password = match body.password.as_deref() {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => return err_json(StatusCode::BAD_REQUEST, "Password is required"),
    };

    let exists: Option<(i32,)> = sqlx::query_as("SELECT id FROM users WHERE email = $1")
        .bind(&email).fetch_optional(&state.pool).await.unwrap_or(None);
    if exists.is_some() { return err_json(StatusCode::BAD_REQUEST, "Email already exists"); }

    let hashed = match tokio::task::spawn_blocking(move || bcrypt::hash(&password, bcrypt::DEFAULT_COST)).await {
        Ok(Ok(h)) => h,
        _ => return err_json(StatusCode::INTERNAL_SERVER_ERROR, "Password hashing failed"),
    };

    let base = body.name.as_deref().unwrap_or("host").to_lowercase().chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' }).collect::<String>();
    let base = base.trim_matches('_').to_string();
    let base = if base.is_empty() { "host".to_string() } else { base };

    let mut handle = base.clone();
    let mut suffix = 1u32;
    loop {
        let taken: Option<(i32,)> = sqlx::query_as("SELECT id FROM users WHERE handle = $1")
            .bind(&handle).fetch_optional(&state.pool).await.unwrap_or(None);
        if taken.is_none() { break; }
        handle = format!("{}_{}", base, suffix); suffix += 1;
    }

    let _ = sqlx::query(
        "INSERT INTO users (email, password, name, handle, game, role, status, profile_setup, balance) VALUES ($1, $2, $3, $4, $5, 'host', 'active', true, 0)"
    ).bind(&email).bind(&hashed).bind(body.name.as_deref()).bind(&handle).bind(body.game.as_deref())
    .execute(&state.pool).await;

    ok_json(json!({ "success": true }))
}

// ─── POST /admin/create-admin ─────────────────────────────────────────────────

#[derive(Deserialize)]
struct CreateAdminBody { email: Option<String>, password: Option<String>, name: Option<String> }

async fn create_admin_user(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateAdminBody>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    let email = match body.email.as_deref() {
        Some(e) if !e.is_empty() => e.to_lowercase(),
        _ => return err_json(StatusCode::BAD_REQUEST, "Email is required"),
    };
    let password = match body.password.as_deref() {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => return err_json(StatusCode::BAD_REQUEST, "Password is required"),
    };

    let exists: Option<(i32,)> = sqlx::query_as("SELECT id FROM users WHERE email = $1")
        .bind(&email).fetch_optional(&state.pool).await.unwrap_or(None);
    if exists.is_some() { return err_json(StatusCode::BAD_REQUEST, "Email already exists"); }

    let hashed = match tokio::task::spawn_blocking(move || bcrypt::hash(&password, bcrypt::DEFAULT_COST)).await {
        Ok(Ok(h)) => h,
        _ => return err_json(StatusCode::INTERNAL_SERVER_ERROR, "Password hashing failed"),
    };

    let _ = sqlx::query(
        "INSERT INTO users (email, password, name, role, status, profile_setup, balance) VALUES ($1, $2, $3, 'admin', 'active', true, 0)"
    ).bind(&email).bind(&hashed).bind(body.name.as_deref()).execute(&state.pool).await;

    ok_json(json!({ "success": true }))
}

// ─── GET /admin/hosts-list ────────────────────────────────────────────────────

async fn list_hosts(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct Row { id: i32, name: Option<String>, email: String, handle: Option<String>, avatar: Option<String>, game: Option<String>, status: String, recommended: bool, host_badge: String, host_rating_avg: f64, host_rating_count: i32, match_count: i64, created_at: Option<chrono::DateTime<chrono::Utc>> }
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT u.id, u.name, u.email, u.handle, u.avatar, u.game, u.status, COALESCE(u.recommended, false) AS recommended, u.host_badge, CAST(u.host_rating_avg AS FLOAT8) AS host_rating_avg, u.host_rating_count, COUNT(m.id) AS match_count, u.created_at FROM users u LEFT JOIN matches m ON m.host_id = u.id WHERE u.role = 'host' GROUP BY u.id ORDER BY u.id"
    ).fetch_all(&state.pool).await.unwrap_or_default();

    ok_json(json!(rows.iter().map(|h| json!({
        "id": h.id, "name": h.name, "email": h.email, "handle": h.handle, "avatar": h.avatar,
        "game": h.game, "status": h.status, "recommended": h.recommended,
        "hostBadge": h.host_badge, "hostRatingAvg": h.host_rating_avg,
        "hostRatingCount": h.host_rating_count, "matchCount": h.match_count,
        "createdAt": h.created_at.map(|t| t.to_rfc3339()),
    })).collect::<Vec<_>>()))
}

// ─── PATCH /admin/hosts/:id/status ───────────────────────────────────────────

#[derive(Deserialize)]
struct StatusBody { status: Option<String> }

async fn update_host_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<StatusBody>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let status = body.status.as_deref().unwrap_or("");
    if status != "active" && status != "banned" {
        return err_json(StatusCode::BAD_REQUEST, "Invalid status");
    }
    let _ = sqlx::query("UPDATE users SET status = $1 WHERE id = $2 AND role = 'host'")
        .bind(status).bind(id).execute(&state.pool).await;
    ok_json(json!({ "success": true }))
}

// ─── PATCH /admin/hosts/:id/recommend ────────────────────────────────────────

async fn toggle_host_recommend(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let current: Option<bool> = sqlx::query_scalar("SELECT recommended FROM users WHERE id = $1 AND role = 'host'")
        .bind(id).fetch_optional(&state.pool).await.unwrap_or(None).flatten();
    let Some(rec) = current else { return err_json(StatusCode::NOT_FOUND, "Host not found"); };
    let _ = sqlx::query("UPDATE users SET recommended = $1 WHERE id = $2")
        .bind(!rec).bind(id).execute(&state.pool).await;
    ok_json(json!({ "recommended": !rec }))
}

// ─── DELETE /admin/hosts/:id ─────────────────────────────────────────────────

async fn delete_host(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    let exists: Option<(i32,)> = sqlx::query_as("SELECT id FROM users WHERE id = $1 AND role = 'host'")
        .bind(id).fetch_optional(&state.pool).await.unwrap_or(None);
    if exists.is_none() { return err_json(StatusCode::NOT_FOUND, "Host not found"); }

    let match_ids: Vec<i32> = sqlx::query_scalar("SELECT id FROM matches WHERE host_id = $1").bind(id).fetch_all(&state.pool).await.unwrap_or_default();
    if !match_ids.is_empty() {
        let ids_str: Vec<String> = match_ids.iter().map(|x| x.to_string()).collect();
        let arr = format!("ARRAY[{}]::int[]", ids_str.join(","));
        let participant_ids: Vec<i32> = sqlx::query_scalar(&format!("SELECT id FROM match_participants WHERE match_id = ANY({})", arr))
            .fetch_all(&state.pool).await.unwrap_or_default();
        if !participant_ids.is_empty() {
            let pids: Vec<String> = participant_ids.iter().map(|x| x.to_string()).collect();
            let _ = sqlx::query(&format!("DELETE FROM match_players WHERE participant_id = ANY(ARRAY[{}]::int[])", pids.join(",")))
                .execute(&state.pool).await;
        }
        let _ = sqlx::query(&format!("DELETE FROM match_participants WHERE match_id = ANY({})", arr)).execute(&state.pool).await;
        let _ = sqlx::query(&format!("DELETE FROM host_earnings WHERE match_id = ANY({})", arr)).execute(&state.pool).await;
        let _ = sqlx::query(&format!("DELETE FROM platform_earnings WHERE match_id = ANY({})", arr)).execute(&state.pool).await;
        let _ = sqlx::query(&format!("DELETE FROM matches WHERE id = ANY({})", arr)).execute(&state.pool).await;
    }

    let auction_ids: Vec<i32> = sqlx::query_scalar("SELECT id FROM auctions WHERE host_id = $1").bind(id).fetch_all(&state.pool).await.unwrap_or_default();
    if !auction_ids.is_empty() {
        let aids: Vec<String> = auction_ids.iter().map(|x| x.to_string()).collect();
        let arr_a = format!("ARRAY[{}]::int[]", aids.join(","));
        let team_ids: Vec<i32> = sqlx::query_scalar(&format!("SELECT id FROM auction_teams WHERE auction_id = ANY({})", arr_a))
            .fetch_all(&state.pool).await.unwrap_or_default();
        if !team_ids.is_empty() {
            let tids: Vec<String> = team_ids.iter().map(|x| x.to_string()).collect();
            let _ = sqlx::query(&format!("DELETE FROM auction_players WHERE team_id = ANY(ARRAY[{}]::int[])", tids.join(","))).execute(&state.pool).await;
        }
        let _ = sqlx::query(&format!("DELETE FROM auction_results WHERE auction_id = ANY({})", arr_a)).execute(&state.pool).await;
        let _ = sqlx::query(&format!("DELETE FROM auction_bids WHERE auction_id = ANY({})", arr_a)).execute(&state.pool).await;
        let _ = sqlx::query(&format!("DELETE FROM auction_teams WHERE auction_id = ANY({})", arr_a)).execute(&state.pool).await;
        let _ = sqlx::query(&format!("DELETE FROM auctions WHERE id = ANY({})", arr_a)).execute(&state.pool).await;
    }

    let _ = sqlx::query("DELETE FROM users WHERE id = $1").bind(id).execute(&state.pool).await;
    ok_json(json!({ "success": true }))
}

// ─── DELETE /admin/matches/:id ────────────────────────────────────────────────

async fn admin_delete_match(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    let exists: Option<(i32,)> = sqlx::query_as("SELECT id FROM matches WHERE id = $1")
        .bind(id).fetch_optional(&state.pool).await.unwrap_or(None);
    if exists.is_none() { return err_json(StatusCode::NOT_FOUND, "Match not found"); }

    let participant_ids: Vec<i32> = sqlx::query_scalar("SELECT id FROM match_participants WHERE match_id = $1")
        .bind(id).fetch_all(&state.pool).await.unwrap_or_default();
    if !participant_ids.is_empty() {
        let pids: Vec<String> = participant_ids.iter().map(|x| x.to_string()).collect();
        let _ = sqlx::query(&format!("DELETE FROM match_players WHERE participant_id = ANY(ARRAY[{}]::int[])", pids.join(",")))
            .execute(&state.pool).await;
    }
    let _ = sqlx::query("DELETE FROM match_participants WHERE match_id = $1").bind(id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM host_earnings WHERE match_id = $1").bind(id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM platform_earnings WHERE match_id = $1").bind(id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM matches WHERE id = $1").bind(id).execute(&state.pool).await;

    ok_json(json!({ "success": true }))
}

// ─── POST /admin/broadcast ────────────────────────────────────────────────────

#[derive(Deserialize)]
struct BroadcastBody { message: Option<String>, target: Option<String>, link: Option<String> }

async fn broadcast(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<BroadcastBody>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let message = match body.message.as_deref().map(str::trim) {
        Some(m) if !m.is_empty() => m.to_string(),
        _ => return err_json(StatusCode::BAD_REQUEST, "Message is required"),
    };
    let sql = match body.target.as_deref() {
        Some("players") => "SELECT id FROM users WHERE role = 'player'",
        Some("hosts") => "SELECT id FROM users WHERE role = 'host'",
        _ => "SELECT id FROM users WHERE role != 'admin'",
    };
    let user_ids: Vec<i32> = sqlx::query_scalar(sql).fetch_all(&state.pool).await.unwrap_or_default();
    let count = user_ids.len();
    let pool = state.pool.clone();
    tokio::spawn(async move {
        for uid in user_ids {
            notify(&pool, uid, "admin_broadcast", &message).await;
        }
    });
    ok_json(json!({ "success": true, "sent": count }))
}

// ─── GET /admin/complaints ────────────────────────────────────────────────────

async fn list_complaints(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct Row { id: i32, user_id: i32, subject: Option<String>, description: Option<String>, host_handle: Option<String>, image_url: Option<String>, created_at: Option<chrono::DateTime<chrono::Utc>>, user_name: Option<String>, user_handle: Option<String>, user_avatar: Option<String>, user_wallet: Option<f64>, user_email: Option<String>, user_role: Option<String>, user_match_count: Option<i64> }
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT c.id, c.user_id, c.subject, c.description, c.host_handle, c.image_url, c.created_at, u.name AS user_name, u.handle AS user_handle, u.avatar AS user_avatar, CAST(u.balance AS FLOAT8) AS user_wallet, u.email AS user_email, u.role AS user_role, COUNT(mp.id) AS user_match_count FROM complaints c LEFT JOIN users u ON u.id = c.user_id LEFT JOIN match_participants mp ON mp.user_id = c.user_id GROUP BY c.id, u.id ORDER BY c.created_at"
    ).fetch_all(&state.pool).await.unwrap_or_default();

    ok_json(json!(rows.iter().map(|c| json!({
        "id": c.id, "userId": c.user_id,
        "userName": c.user_name.as_deref().or(c.user_email.as_deref()),
        "userHandle": c.user_handle, "userAvatar": c.user_avatar,
        "userWallet": c.user_wallet, "userEmail": c.user_email,
        "userRole": c.user_role.as_deref().unwrap_or("player"),
        "userMatchCount": c.user_match_count.unwrap_or(0),
        "subject": c.subject, "description": c.description,
        "hostHandle": c.host_handle, "imageUrl": c.image_url,
        "createdAt": c.created_at.map(|t| t.to_rfc3339()),
    })).collect::<Vec<_>>()))
}

// ─── GET /admin/referrals ─────────────────────────────────────────────────────

async fn list_referrals(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct Row { id: i32, referrer_id: i32, referred_id: i32, completed: bool, referrer_rewarded: bool, created_at: Option<chrono::DateTime<chrono::Utc>>, referrer_name: Option<String>, referrer_handle: Option<String>, referred_name: Option<String>, referred_handle: Option<String> }
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT r.id, r.referrer_id, r.referred_id, r.completed, r.referrer_rewarded, r.created_at, ur.name AS referrer_name, ur.handle AS referrer_handle, ud.name AS referred_name, ud.handle AS referred_handle FROM referrals r LEFT JOIN users ur ON ur.id = r.referrer_id LEFT JOIN users ud ON ud.id = r.referred_id ORDER BY r.created_at DESC"
    ).fetch_all(&state.pool).await.unwrap_or_default();

    ok_json(json!(rows.iter().map(|r| json!({
        "id": r.id, "referrerId": r.referrer_id,
        "referrerName": r.referrer_name.as_deref().unwrap_or("Unknown"),
        "referrerHandle": r.referrer_handle,
        "referredId": r.referred_id,
        "referredName": r.referred_name.as_deref().unwrap_or("Unknown"),
        "referredHandle": r.referred_handle,
        "completed": r.completed, "referrerRewarded": r.referrer_rewarded,
        "createdAt": r.created_at.map(|t| t.to_rfc3339()),
    })).collect::<Vec<_>>()))
}

// ─── GET /admin/leaderboard-ctrl ──────────────────────────────────────────────

async fn leaderboard_ctrl(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let settings = get_settings();

    #[derive(sqlx::FromRow)]
    struct Row { id: i32, name: Option<String>, handle: Option<String>, avatar: Option<String>, game: Option<String>, trust_score: i32, tournament_wins: i32 }
    let players: Vec<Row> = sqlx::query_as(
        "SELECT id, name, handle, avatar, game, trust_score, tournament_wins FROM users WHERE role = 'player' ORDER BY trust_score DESC LIMIT 50"
    ).fetch_all(&state.pool).await.unwrap_or_default();

    ok_json(json!({
        "featuredPlayerIds": settings.featured_player_ids,
        "players": players.iter().map(|p| json!({ "id": p.id, "name": p.name, "handle": p.handle, "avatar": p.avatar, "game": p.game, "trustScore": p.trust_score, "tournamentWins": p.tournament_wins })).collect::<Vec<_>>(),
    }))
}

// ─── POST /admin/leaderboard-ctrl/feature/:id ─────────────────────────────────

async fn toggle_feature_player(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let mut settings = get_settings();
    let was_featured = settings.featured_player_ids.contains(&id);
    if was_featured {
        settings.featured_player_ids.retain(|&x| x != id);
    } else {
        settings.featured_player_ids.push(id);
    }
    save_settings(&settings);
    ok_json(json!({ "success": true, "featured": !was_featured }))
}

// ─── POST /admin/leaderboard-ctrl/reset ──────────────────────────────────────

async fn reset_featured(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let mut settings = get_settings();
    settings.featured_player_ids.clear();
    save_settings(&settings);
    ok_json(json!({ "success": true }))
}

// ─── GET /admin/store ─────────────────────────────────────────────────────────

async fn admin_store(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let settings = get_settings();
    let items: Vec<Value> = STORE_ITEMS.iter().map(|item| {
        let cost = settings.store_price_overrides.get(item.id).copied().unwrap_or(item.cost);
        json!({ "id": item.id, "category": item.category, "name": item.name, "description": item.description, "emoji": item.emoji, "cost": cost, "originalCost": item.cost, "cssValue": item.css_value })
    }).collect();
    ok_json(json!(items))
}

// ─── PATCH /admin/store/:id/price ─────────────────────────────────────────────

#[derive(Deserialize)]
struct PriceBody { price: Option<Value> }

async fn set_store_price(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(item_id): Path<String>,
    Json(body): Json<PriceBody>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    if !STORE_ITEMS.iter().any(|i| i.id == item_id) {
        return err_json(StatusCode::NOT_FOUND, "Item not found");
    }
    let price = match body.price.as_ref().and_then(val_to_f64).map(|p| p as i32) {
        Some(p) if p >= 0 => p,
        _ => return err_json(StatusCode::BAD_REQUEST, "Invalid price"),
    };
    let mut settings = get_settings();
    settings.store_price_overrides.insert(item_id, price);
    save_settings(&settings);
    ok_json(json!({ "success": true }))
}

// ─── GET /admin/settings ──────────────────────────────────────────────────────

async fn get_settings_route(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let s = get_settings();
    ok_json(serde_json::to_value(&s).unwrap_or_default())
}

// ─── POST /admin/settings ─────────────────────────────────────────────────────

async fn update_settings(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }
    let mut settings = get_settings();
    if let Some(fee_val) = body.get("platformFeePercent") {
        match val_to_f64(fee_val) {
            Some(fee) if fee >= 0.0 && fee <= 50.0 => settings.platform_fee_percent = fee,
            _ => return err_json(StatusCode::BAD_REQUEST, "Fee must be between 0 and 50"),
        }
    }
    save_settings(&settings);
    ok_json(json!({ "success": true, "settings": serde_json::to_value(&settings).unwrap_or_default() }))
}

// ─── GET /admin/host-applications ────────────────────────────────────────────

async fn list_host_applications(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<StatusQuery>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    let mut sql = "SELECT ha.id, ha.user_id, ha.handle, ha.name, ha.game_ign, ha.phone_number, ha.experience, ha.previous_hosting, ha.proof_images, ha.status, ha.admin_notes, ha.created_at, ha.updated_at, u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar, u.game AS user_game, u.trust_score AS user_trust_score FROM host_applications ha LEFT JOIN users u ON u.id = ha.user_id".to_string();
    if let Some(ref s) = q.status { if s != "all" { sql.push_str(&format!(" WHERE ha.status = '{}'", s.replace('\'', "''"))); } }
    sql.push_str(" ORDER BY ha.created_at DESC");

    #[derive(sqlx::FromRow)]
    struct Row {
        id: i32, user_id: i32, handle: Option<String>, name: Option<String>,
        game_ign: Option<String>, phone_number: Option<String>, experience: String,
        previous_hosting: Option<String>, proof_images: Option<Value>,
        status: String, admin_notes: Option<String>,
        created_at: Option<chrono::DateTime<chrono::Utc>>,
        updated_at: Option<chrono::DateTime<chrono::Utc>>,
        user_name: Option<String>, user_email: Option<String>,
        user_avatar: Option<String>, user_game: Option<String>, user_trust_score: Option<i32>,
    }
    let rows: Vec<Row> = sqlx::query_as(&sql).fetch_all(&state.pool).await.unwrap_or_default();

    ok_json(json!(rows.iter().map(|a| json!({
        "id": a.id, "userId": a.user_id, "handle": a.handle, "name": a.name,
        "gameIgn": a.game_ign, "phoneNumber": a.phone_number, "experience": a.experience,
        "previousHosting": a.previous_hosting, "proofImages": a.proof_images.as_ref().unwrap_or(&json!([])),
        "status": a.status, "adminNotes": a.admin_notes,
        "createdAt": a.created_at.map(|t| t.to_rfc3339()),
        "updatedAt": a.updated_at.map(|t| t.to_rfc3339()),
        "userName": a.user_name, "userEmail": a.user_email,
        "userAvatar": a.user_avatar, "userGame": a.user_game,
        "userTrustScore": a.user_trust_score,
    })).collect::<Vec<_>>()))
}

// ─── PATCH /admin/host-applications/:id/approve ───────────────────────────────

async fn approve_host_application(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct App { user_id: i32, status: String }
    let app: Option<App> = sqlx::query_as("SELECT user_id, status FROM host_applications WHERE id = $1")
        .bind(id).fetch_optional(&state.pool).await.unwrap_or(None);

    let Some(app) = app else { return err_json(StatusCode::NOT_FOUND, "Application not found"); };
    if app.status != "pending" { return err_json(StatusCode::BAD_REQUEST, "Application already processed"); }

    let _ = sqlx::query("UPDATE host_applications SET status = 'approved', updated_at = NOW() WHERE id = $1")
        .bind(id).execute(&state.pool).await;
    let _ = sqlx::query("UPDATE users SET role = 'host', status = 'active' WHERE id = $1")
        .bind(app.user_id).execute(&state.pool).await;

    let pool = state.pool.clone();
    let uid = app.user_id;
    tokio::spawn(async move {
        notify(&pool, uid, "host_approved", "Congratulations! Your host application has been approved. You are now a host! 🎉").await;
    });
    ok_json(json!({ "success": true }))
}

// ─── PATCH /admin/host-applications/:id/reject ────────────────────────────────

#[derive(Deserialize)]
struct RejectAppBody { notes: Option<String> }

async fn reject_host_application(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<RejectAppBody>,
) -> Response {
    if let Err(r) = auth_admin(&state, &headers).await { return r; }

    #[derive(sqlx::FromRow)]
    struct App { user_id: i32, status: String }
    let app: Option<App> = sqlx::query_as("SELECT user_id, status FROM host_applications WHERE id = $1")
        .bind(id).fetch_optional(&state.pool).await.unwrap_or(None);

    let Some(app) = app else { return err_json(StatusCode::NOT_FOUND, "Application not found"); };
    if app.status != "pending" { return err_json(StatusCode::BAD_REQUEST, "Application already processed"); }

    let notes = body.notes.as_deref().filter(|s| !s.trim().is_empty());
    let _ = sqlx::query("UPDATE host_applications SET status = 'rejected', admin_notes = $1, updated_at = NOW() WHERE id = $2")
        .bind(notes).bind(id).execute(&state.pool).await;

    let pool = state.pool.clone();
    let uid = app.user_id;
    tokio::spawn(async move {
        notify(&pool, uid, "host_rejected", "Your host application was not approved at this time. You may apply again later.").await;
    });
    ok_json(json!({ "success": true }))
}

// ─── POST /host-applications ──────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitAppBody {
    game_ign: Option<String>,
    phone_number: Option<String>,
    experience: Option<String>,
    previous_hosting: Option<String>,
    proof_images: Option<Value>,
}

async fn submit_host_application(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SubmitAppBody>,
) -> Response {
    let user = match auth_user(&state, &headers).await { Ok(u) => u, Err(r) => return r };
    if user.role != "player" { return err_json(StatusCode::FORBIDDEN, "Only players can apply to become a host"); }

    let experience = match body.experience.as_deref().map(str::trim) {
        Some(e) if !e.is_empty() => e.to_string(),
        _ => return err_json(StatusCode::BAD_REQUEST, "Hosting experience is required"),
    };

    let pending: Option<(i32,)> = sqlx::query_as(
        "SELECT id FROM host_applications WHERE user_id = $1 AND status = 'pending'"
    ).bind(user.id).fetch_optional(&state.pool).await.unwrap_or(None);
    if pending.is_some() { return err_json(StatusCode::BAD_REQUEST, "You already have a pending application"); }

    let proof = body.proof_images.as_ref().and_then(|v| if v.is_array() { Some(v.to_string()) } else { None }).unwrap_or_else(|| "[]".to_string());

    #[derive(sqlx::FromRow)]
    struct App { id: i32, user_id: i32, handle: Option<String>, name: Option<String>, game_ign: Option<String>, phone_number: Option<String>, experience: String, previous_hosting: Option<String>, proof_images: Option<Value>, status: String }
    let app: Option<App> = sqlx::query_as(
        "INSERT INTO host_applications (user_id, handle, name, game_ign, phone_number, experience, previous_hosting, proof_images, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'pending') RETURNING id, user_id, handle, name, game_ign, phone_number, experience, previous_hosting, proof_images, status"
    )
    .bind(user.id).bind(user.handle.as_deref()).bind(user.name.as_deref())
    .bind(body.game_ign.as_deref().map(str::trim))
    .bind(body.phone_number.as_deref().map(str::trim))
    .bind(&experience)
    .bind(body.previous_hosting.as_deref().map(str::trim))
    .bind(&proof)
    .fetch_optional(&state.pool).await.unwrap_or(None);

    let admin_ids: Vec<i32> = sqlx::query_scalar("SELECT id FROM users WHERE role = 'admin'")
        .fetch_all(&state.pool).await.unwrap_or_default();
    let pool = state.pool.clone();
    let handle_str = user.handle.clone().unwrap_or_else(|| user.name.clone().unwrap_or_default());
    tokio::spawn(async move {
        for aid in admin_ids {
            notify(&pool, aid, "host_application", &format!("New host application from @{}", handle_str)).await;
        }
    });

    ok_json(app.map(|a| json!({ "id": a.id, "userId": a.user_id, "handle": a.handle, "name": a.name, "gameIgn": a.game_ign, "phoneNumber": a.phone_number, "experience": a.experience, "previousHosting": a.previous_hosting, "proofImages": a.proof_images.unwrap_or(json!([])), "status": a.status })).unwrap_or(json!({ "success": true })))
}

// ─── GET /host-applications/my ────────────────────────────────────────────────

async fn my_host_application(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    let user = match auth_user(&state, &headers).await { Ok(u) => u, Err(r) => return r };

    #[derive(sqlx::FromRow)]
    struct App { id: i32, user_id: i32, handle: Option<String>, name: Option<String>, game_ign: Option<String>, phone_number: Option<String>, experience: String, previous_hosting: Option<String>, proof_images: Option<Value>, status: String, admin_notes: Option<String>, created_at: Option<chrono::DateTime<chrono::Utc>> }
    let app: Option<App> = sqlx::query_as(
        "SELECT id, user_id, handle, name, game_ign, phone_number, experience, previous_hosting, proof_images, status, admin_notes, created_at FROM host_applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1"
    ).bind(user.id).fetch_optional(&state.pool).await.unwrap_or(None);

    match app {
        None => ok_json(Value::Null),
        Some(a) => ok_json(json!({ "id": a.id, "userId": a.user_id, "handle": a.handle, "name": a.name, "gameIgn": a.game_ign, "phoneNumber": a.phone_number, "experience": a.experience, "previousHosting": a.previous_hosting, "proofImages": a.proof_images.unwrap_or(json!([])), "status": a.status, "adminNotes": a.admin_notes, "createdAt": a.created_at.map(|t| t.to_rfc3339()) })),
    }
}

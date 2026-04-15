use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::{delete, get, post, put},
    Json, Router,
};
use rand::Rng;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::sync::Arc;

use crate::AppState;
use crate::auth::{auth_user, err_json, ok_json};

// ─── DB Row Structs ───────────────────────────────────────────────────────────

const MATCH_COLS: &str = r#"
    id, code, game, mode, team_size,
    CAST(entry_fee AS FLOAT8)              AS entry_fee,
    CAST(showcase_prize_pool AS FLOAT8)    AS showcase_prize_pool,
    CAST(host_contribution AS FLOAT8)      AS host_contribution,
    CAST(host_stake AS FLOAT8)             AS host_stake,
    CAST(host_commission_percent AS FLOAT8) AS host_commission_percent,
    CAST(escrow_balance AS FLOAT8)         AS escrow_balance,
    escrow_status::TEXT                    AS escrow_status,
    min_trust_score,
    start_time,
    status::TEXT                           AS status,
    slots, filled_slots, host_id,
    room_id, room_password, room_released,
    description, thumbnail_image, category, map,
    is_esports_only, stream_link, custom_rules,
    reward_distribution, result_screenshot_urls,
    screenshot_uploaded_at, prize_distributed_at, group_id
"#;

#[derive(sqlx::FromRow, Debug, Clone)]
struct DbMatch {
    id: i32,
    code: String,
    game: String,
    mode: String,
    team_size: i32,
    entry_fee: f64,
    showcase_prize_pool: f64,
    host_contribution: f64,
    host_stake: f64,
    host_commission_percent: f64,
    escrow_balance: f64,
    escrow_status: String,
    min_trust_score: i32,
    start_time: chrono::DateTime<chrono::Utc>,
    status: String,
    slots: i32,
    filled_slots: i32,
    host_id: i32,
    room_id: Option<String>,
    room_password: Option<String>,
    room_released: bool,
    description: Option<String>,
    thumbnail_image: Option<String>,
    category: Option<String>,
    map: Option<String>,
    is_esports_only: bool,
    stream_link: Option<String>,
    custom_rules: Option<String>,
    reward_distribution: Option<String>,
    result_screenshot_urls: Option<String>,
    screenshot_uploaded_at: Option<chrono::DateTime<chrono::Utc>>,
    prize_distributed_at: Option<chrono::DateTime<chrono::Utc>>,
    group_id: Option<i32>,
}

#[derive(sqlx::FromRow, Debug)]
struct DbHostInfo {
    id: i32,
    name: Option<String>,
    handle: Option<String>,
    avatar: Option<String>,
    followers_count: i32,
    host_rating_avg: f64,
    host_rating_count: i32,
    host_badge: String,
    recommended: bool,
}

#[derive(sqlx::FromRow, Debug)]
struct DbParticipant {
    id: i32,
    match_id: i32,
    user_id: i32,
    team_name: Option<String>,
    team_number: i32,
    rank: Option<i32>,
    kills: Option<i32>,
    reward: Option<f64>,
}

#[derive(sqlx::FromRow, Debug)]
struct DbMatchPlayer {
    ign: String,
    uid: String,
    position: i32,
}

#[derive(sqlx::FromRow, Debug)]
struct DbParticipantFull {
    id: i32,
    user_id: i32,
    team_name: Option<String>,
    team_number: i32,
    rank: Option<i32>,
    kills: Option<i32>,
    reward: Option<f64>,
    trust_score: i32,
    trust_tier: String,
    user_name: Option<String>,
    user_avatar: Option<String>,
    user_handle: Option<String>,
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

fn generate_code() -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    let suffix: String = (0..6)
        .map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char)
        .collect();
    format!("TX{}", suffix)
}

fn get_trust_tier(score: i32) -> &'static str {
    if score < 300 { "Risky" }
    else if score < 500 { "Beginner" }
    else if score < 700 { "Trusted" }
    else if score < 900 { "Veteran" }
    else { "Elite" }
}

fn get_host_badge(matches_hosted: i32, avg_rating: f64) -> &'static str {
    if matches_hosted < 5 { "New Host" }
    else if avg_rating < 3.0 { "Flagged Host" }
    else if matches_hosted >= 50 && avg_rating >= 4.8 { "Elite Organizer" }
    else if matches_hosted >= 20 && avg_rating >= 4.5 { "Trusted Organizer" }
    else if matches_hosted >= 5 && avg_rating >= 4.0 { "Verified Organizer" }
    else { "New Host" }
}

async fn serialize_match(pool: &PgPool, m: &DbMatch, user_id: Option<i32>) -> Value {
    let host: Option<DbHostInfo> = sqlx::query_as(
        r#"SELECT id,
            name, handle, avatar, followers_count,
            CAST(host_rating_avg AS FLOAT8) AS host_rating_avg,
            host_rating_count,
            host_badge,
            COALESCE(recommended, false) AS recommended
           FROM users WHERE id = $1"#
    )
    .bind(m.host_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let mut is_following_host = false;
    let mut is_joined = false;
    let mut has_reviewed = false;

    if let Some(uid) = user_id {
        let follow_exists: Option<(i64,)> = sqlx::query_as(
            "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2"
        )
        .bind(uid).bind(m.host_id)
        .fetch_optional(pool).await.unwrap_or(None);
        is_following_host = follow_exists.is_some();

        let joined: Option<(i64,)> = sqlx::query_as(
            "SELECT 1 FROM match_participants WHERE match_id = $1 AND user_id = $2"
        )
        .bind(m.id).bind(uid)
        .fetch_optional(pool).await.unwrap_or(None);
        is_joined = joined.is_some();

        if m.status == "completed" && is_joined {
            let reviewed: Option<(i64,)> = sqlx::query_as(
                "SELECT 1 FROM host_reviews WHERE match_id = $1 AND reviewer_id = $2"
            )
            .bind(m.id).bind(uid)
            .fetch_optional(pool).await.unwrap_or(None);
            has_reviewed = reviewed.is_some();
        }
    }

    let entry_fee_pool = m.filled_slots as f64 * m.entry_fee;
    let total_pool = entry_fee_pool + m.host_contribution;
    let is_large_pool = m.filled_slots >= 8;
    let winners_percent: f64 = if is_large_pool { 0.85 } else { 0.90 };
    let host_percent = m.host_commission_percent / 100.0;
    let platform_percent = 0.05_f64;
    let live_prize_pool = entry_fee_pool * winners_percent + m.host_contribution;
    let host_cut = entry_fee_pool * host_percent;
    let platform_cut = entry_fee_pool * platform_percent;

    let host_rating_avg: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(AVG(rating) AS FLOAT8) FROM host_reviews WHERE host_id = $1"
    )
    .bind(m.host_id)
    .fetch_optional(pool).await.unwrap_or(None).flatten();

    let host_review_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM host_reviews WHERE host_id = $1"
    )
    .bind(m.host_id)
    .fetch_one(pool).await.unwrap_or(0);

    let reward_distribution: Value = m.reward_distribution.as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(Value::Null);

    let screenshot_urls: Value = m.result_screenshot_urls.as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(json!([]));

    let custom_rules: Value = m.custom_rules.as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(json!([]));

    let h = host.as_ref();
    let host_rating_display = if h.map(|x| x.host_rating_count).unwrap_or(0) > 0 {
        json!(h.map(|x| x.host_rating_avg).unwrap_or(0.0))
    } else {
        host_rating_avg.map(|v| json!(v)).unwrap_or(Value::Null)
    };

    let mut result = json!({
        "id": m.id,
        "code": m.code,
        "game": m.game,
        "mode": m.mode,
        "category": m.category,
        "map": m.map,
        "isEsportsOnly": m.is_esports_only,
        "teamSize": m.team_size,
        "entryFee": m.entry_fee,
        "showcasePrizePool": m.showcase_prize_pool,
        "hostContribution": m.host_contribution,
        "hostStake": m.host_stake,
        "hostCommissionPercent": m.host_commission_percent,
        "escrowBalance": m.escrow_balance,
        "escrowStatus": m.escrow_status,
        "prizeDistributedAt": m.prize_distributed_at.map(|t| t.to_rfc3339()),
        "minTrustScore": m.min_trust_score,
        "livePrizePool": live_prize_pool,
        "hostCut": host_cut,
        "platformCut": platform_cut,
        "totalPool": total_pool,
        "winnersPercent": (winners_percent * 100.0) as i32,
        "hostPercent": (host_percent * 100.0) as i32,
        "startTime": m.start_time.to_rfc3339(),
        "status": m.status,
        "slots": m.slots,
        "filledSlots": m.filled_slots,
        "hostId": m.host_id,
        "hostHandle": h.and_then(|x| x.handle.as_deref()).unwrap_or("@host"),
        "hostName": h.and_then(|x| x.name.as_deref()).unwrap_or("Host"),
        "hostAvatar": h.and_then(|x| x.avatar.as_deref()).unwrap_or("🛡️"),
        "hostFollowers": h.map(|x| x.followers_count).unwrap_or(0),
        "hostRating": host_rating_display,
        "hostReviewCount": h.map(|x| x.host_rating_count as i64).unwrap_or(host_review_count),
        "hostBadge": h.map(|x| x.host_badge.as_str()).unwrap_or("New Host"),
        "isFollowingHost": is_following_host,
        "isRecommended": !is_following_host && h.map(|x| x.recommended).unwrap_or(false),
        "isJoined": is_joined,
        "roomReleased": m.room_released,
        "description": m.description,
        "thumbnailImage": m.thumbnail_image,
        "hasReviewed": has_reviewed,
        "rewardDistribution": reward_distribution,
        "resultScreenshotUrls": screenshot_urls,
        "screenshotUploadedAt": m.screenshot_uploaded_at.map(|t| t.to_rfc3339()),
        "streamLink": m.stream_link,
        "customRules": custom_rules,
        "groupId": m.group_id,
    });

    if is_joined && m.room_released {
        result["roomId"] = json!(m.room_id);
        result["roomPassword"] = json!(m.room_password);
    }
    result
}

async fn notify(pool: &PgPool, user_id: i32, ntype: &str, message: &str, _url: &str) {
    let _ = sqlx::query(
        "INSERT INTO notifications (user_id, type, message, read) VALUES ($1, $2, $3, false)"
    )
    .bind(user_id)
    .bind(ntype)
    .bind(message)
    .execute(pool)
    .await;
}

async fn add_trust_score_event(
    pool: &PgPool,
    user_id: i32,
    event_type: &str,
    point_change: i32,
    reason: &str,
    match_id: Option<i32>,
) {
    let current: Option<i32> = sqlx::query_scalar("SELECT trust_score FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None)
        .flatten();
    let next_score = (current.unwrap_or(500) + point_change).clamp(0, 1000);
    let tier = get_trust_tier(next_score);
    let _ = sqlx::query(
        "UPDATE users SET trust_score = $1, trust_tier = $2 WHERE id = $3"
    )
    .bind(next_score).bind(tier).bind(user_id)
    .execute(pool).await;
    let _ = sqlx::query(
        "INSERT INTO trust_score_events (user_id, event_type, point_change, reason, match_id) VALUES ($1,$2,$3,$4,$5)"
    )
    .bind(user_id).bind(event_type).bind(point_change).bind(reason).bind(match_id)
    .execute(pool).await;
}

async fn fetch_match(pool: &PgPool, id: i32) -> Option<DbMatch> {
    let q = format!("SELECT {} FROM matches WHERE id = $1", MATCH_COLS);
    sqlx::query_as::<_, DbMatch>(&q)
        .bind(id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None)
}

// ─── Router ───────────────────────────────────────────────────────────────────

pub fn matches_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/matches",               get(list_matches).post(create_match))
        .route("/matches/:id",           get(get_match).delete(delete_match))
        .route("/matches/:id/join",      post(join_match))
        .route("/matches/:id/room",      put(update_room))
        .route("/matches/:id/go-live",   post(go_live))
        .route("/matches/:id/submit-result", post(submit_result))
        .route("/matches/:id/players",   get(get_players))
        .route("/matches/:id/leaderboard", put(update_leaderboard))
        .route("/matches/:id/participants/:pid", delete(kick_participant))
        .route("/players/:uid/matches",  get(player_matches))
        .route("/my-matches",            get(my_matches))
        .route("/matches/:id/review",    post(post_review))
        .route("/matches/:id/bracket",   get(get_bracket).post(create_bracket).put(update_bracket))
        .route("/admin/matches",         get(admin_list_matches))
}

// ─── GET /matches ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ListMatchesQuery {
    search:   Option<String>,
    status:   Option<String>,
    game:     Option<String>,
    category: Option<String>,
    #[serde(rename = "teamSize")]
    team_size: Option<i32>,
    map:      Option<String>,
    paid:     Option<String>,
}

async fn list_matches(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<ListMatchesQuery>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };

    let mut wheres: Vec<String> = vec![];
    let mut params: Vec<String> = vec![];
    let mut idx = 1usize;

    if let Some(ref status) = q.status {
        if status != "all" {
            wheres.push(format!("status::TEXT = ${}", idx));
            params.push(status.clone()); idx += 1;
        }
    }
    if let Some(ref game) = q.game {
        wheres.push(format!("game ILIKE ${}", idx));
        params.push(game.clone()); idx += 1;
    } else if let Some(ref g) = user.game {
        if user.role == "player" {
            wheres.push(format!("game ILIKE ${}", idx));
            params.push(g.clone()); idx += 1;
        }
    }
    if let Some(ref cat) = q.category {
        wheres.push(format!("category ILIKE ${}", idx));
        params.push(cat.clone()); idx += 1;
    }
    if let Some(ts) = q.team_size {
        wheres.push(format!("team_size = ${}", idx));
        params.push(ts.to_string()); idx += 1;
    }
    if let Some(ref map) = q.map {
        wheres.push(format!("map ILIKE ${}", idx));
        params.push(map.clone()); idx += 1;
    }
    if let Some(ref paid) = q.paid {
        match paid.as_str() {
            "free" => wheres.push("CAST(entry_fee AS NUMERIC) = 0".to_string()),
            "paid" => wheres.push("CAST(entry_fee AS NUMERIC) > 0".to_string()),
            _ => {}
        }
    }
    if let Some(ref search) = q.search {
        wheres.push(format!(
            "(code ILIKE ${0} OR game ILIKE ${0} OR mode ILIKE ${0} OR category ILIKE ${0})",
            idx
        ));
        params.push(format!("%{}%", search)); idx += 1;
    }

    if user.role == "player" {
        let followed: Vec<i32> = sqlx::query_scalar(
            "SELECT following_id FROM follows WHERE follower_id = $1"
        )
        .bind(user.id)
        .fetch_all(&state.pool).await.unwrap_or_default();

        let recommended: Vec<i32> = sqlx::query_scalar(
            "SELECT id FROM users WHERE role = 'host' AND COALESCE(recommended, false) = true"
        )
        .fetch_all(&state.pool).await.unwrap_or_default();

        let mut allowed: Vec<i32> = followed;
        for r in recommended { if !allowed.contains(&r) { allowed.push(r); } }

        if !allowed.is_empty() {
            let ids: Vec<String> = allowed.iter().map(|x| x.to_string()).collect();
            wheres.push(format!("host_id = ANY(ARRAY[{}]::int[])", ids.join(",")));
        }

        if !user.is_esports_player {
            wheres.push("is_esports_only = false".to_string());
        }
    }

    let _ = idx; // suppress unused warning
    let where_clause = if wheres.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", wheres.join(" AND "))
    };

    let sql = format!(
        "SELECT {} FROM matches {} ORDER BY created_at",
        MATCH_COLS, where_clause
    );

    let mut q_builder = sqlx::query_as::<_, DbMatch>(&sql);
    for p in &params {
        q_builder = q_builder.bind(p);
    }
    let matches: Vec<DbMatch> = q_builder.fetch_all(&state.pool).await.unwrap_or_default();

    let mut serialized = Vec::with_capacity(matches.len());
    for m in &matches {
        serialized.push(serialize_match(&state.pool, m, Some(user.id)).await);
    }
    ok_json(json!(serialized))
}

// ─── POST /matches ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateMatchBody {
    game: Option<String>,
    mode: Option<String>,
    #[serde(rename = "teamSize")]
    team_size: Option<serde_json::Value>,
    #[serde(rename = "entryFee")]
    entry_fee: Option<serde_json::Value>,
    slots: Option<serde_json::Value>,
    #[serde(rename = "startTime")]
    start_time: Option<String>,
    #[serde(rename = "showcasePrizePool")]
    showcase_prize_pool: Option<serde_json::Value>,
    description: Option<String>,
    #[serde(rename = "thumbnailImage")]
    thumbnail_image: Option<String>,
    #[serde(rename = "hostContribution")]
    host_contribution: Option<serde_json::Value>,
    #[serde(rename = "hostStake")]
    host_stake: Option<serde_json::Value>,
    #[serde(rename = "minTrustScore")]
    min_trust_score: Option<serde_json::Value>,
    category: Option<String>,
    map: Option<String>,
    #[serde(rename = "rewardDistribution")]
    reward_distribution: Option<Value>,
    #[serde(rename = "isEsportsOnly")]
    is_esports_only: Option<serde_json::Value>,
    #[serde(rename = "streamLink")]
    stream_link: Option<String>,
    #[serde(rename = "customRules")]
    custom_rules: Option<Vec<Value>>,
}

fn val_to_f64(v: &Option<serde_json::Value>) -> Option<f64> {
    v.as_ref().and_then(|x| match x {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    })
}
fn val_to_i32(v: &Option<serde_json::Value>) -> Option<i32> {
    val_to_f64(v).map(|x| x as i32)
}
fn val_to_bool(v: &Option<serde_json::Value>) -> bool {
    match v {
        Some(Value::Bool(b)) => *b,
        Some(Value::String(s)) => s == "true",
        _ => false,
    }
}

async fn create_match(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateMatchBody>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    if user.role != "host" && user.role != "admin" {
        return err_json(StatusCode::FORBIDDEN, "Only hosts can create matches");
    }

    let resolved_game = body.game.clone().or_else(|| user.game.clone());
    let Some(game) = resolved_game else {
        return err_json(StatusCode::BAD_REQUEST, "game is required");
    };
    let Some(mode) = body.mode.clone() else {
        return err_json(StatusCode::BAD_REQUEST, "mode is required");
    };
    let Some(start_time_str) = body.start_time.clone() else {
        return err_json(StatusCode::BAD_REQUEST, "startTime is required");
    };

    let team_size = val_to_i32(&body.team_size).unwrap_or(1);
    let slots_count = val_to_i32(&body.slots).unwrap_or(0);
    let entry_fee = val_to_f64(&body.entry_fee).unwrap_or(0.0);

    if team_size < 1 || team_size > 100 {
        return err_json(StatusCode::BAD_REQUEST, "teamSize must be a positive integer");
    }
    if slots_count < 2 || slots_count > 10000 {
        return err_json(StatusCode::BAD_REQUEST, "slots must be between 2 and 10000");
    }
    if entry_fee < 0.0 {
        return err_json(StatusCode::BAD_REQUEST, "entryFee must be a non-negative number");
    }

    let start_time: chrono::DateTime<chrono::Utc> = match chrono::DateTime::parse_from_rfc3339(&start_time_str) {
        Ok(t) => t.into(),
        Err(_) => return err_json(StatusCode::BAD_REQUEST, "Invalid startTime"),
    };
    if start_time <= chrono::Utc::now() {
        return err_json(StatusCode::BAD_REQUEST, "startTime must be in the future");
    }

    let host_contribution = val_to_f64(&body.host_contribution).unwrap_or(0.0);
    let host_stake = val_to_f64(&body.host_stake).unwrap_or(host_contribution);
    let min_trust_score = val_to_i32(&body.min_trust_score).unwrap_or(0);

    if host_contribution < 0.0 || host_stake < 0.0 {
        return err_json(StatusCode::BAD_REQUEST, "host stake must be a non-negative number");
    }
    if min_trust_score < 0 || min_trust_score > 1000 {
        return err_json(StatusCode::BAD_REQUEST, "minTrustScore must be between 0 and 1000");
    }

    if host_stake > 0.0 && user.balance < host_stake {
        return err_json(
            StatusCode::BAD_REQUEST,
            &format!("Insufficient balance. You have {:.0} GC but tried to stake {:.0} GC.", user.balance, host_stake),
        );
    }

    let showcase_prize_pool = val_to_f64(&body.showcase_prize_pool).unwrap_or(0.0);
    let is_esports_only = val_to_bool(&body.is_esports_only);
    let reward_dist_str = body.reward_distribution.as_ref().map(|v| v.to_string());
    let custom_rules_str = body.custom_rules.as_ref()
        .filter(|r| !r.is_empty())
        .map(|r| serde_json::to_string(r).unwrap_or_default());
    let escrow_status = if host_stake > 0.0 { "locked" } else { "pending" };

    let code = generate_code();

    if host_stake > 0.0 {
        let r = sqlx::query_scalar::<_, i64>(
            "SELECT 1 FROM users WHERE id = $1 AND balance >= $2"
        )
        .bind(user.id).bind(host_stake)
        .fetch_optional(&state.pool).await.unwrap_or(None);
        if r.is_none() {
            return err_json(StatusCode::BAD_REQUEST, "Insufficient balance");
        }
    }

    let match_id: i32 = match sqlx::query_scalar(
        r#"INSERT INTO matches (code, game, mode, team_size, entry_fee, slots, host_id, start_time, status,
            filled_slots, showcase_prize_pool, host_contribution, host_stake, escrow_balance,
            host_commission_percent, escrow_status, min_trust_score, room_released,
            description, thumbnail_image, category, map, reward_distribution,
            is_esports_only, stream_link, custom_rules)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'upcoming',0,$9,$10,$11,$11,'10',$12,$13,false,
            $14,$15,$16,$17,$18,$19,$20,$21)
           RETURNING id"#
    )
    .bind(&code).bind(&game).bind(&mode).bind(team_size)
    .bind(entry_fee).bind(slots_count).bind(user.id).bind(start_time)
    .bind(showcase_prize_pool).bind(host_contribution).bind(host_stake)
    .bind(escrow_status).bind(min_trust_score)
    .bind(body.description.as_deref()).bind(body.thumbnail_image.as_deref())
    .bind(body.category.as_deref()).bind(body.map.as_deref())
    .bind(reward_dist_str.as_deref())
    .bind(is_esports_only)
    .bind(body.stream_link.as_deref())
    .bind(custom_rules_str.as_deref())
    .fetch_one(&state.pool).await {
        Ok(id) => id,
        Err(e) => return err_json(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };

    if host_stake > 0.0 {
        let _ = sqlx::query("UPDATE users SET balance = balance - $1 WHERE id = $2")
            .bind(host_stake).bind(user.id).execute(&state.pool).await;
        let _ = sqlx::query(
            "INSERT INTO match_escrow_transactions (match_id, user_id, type, amount) VALUES ($1,$2,'host_stake',$3)"
        )
        .bind(match_id).bind(user.id).bind(host_stake).execute(&state.pool).await;
    }

    let group_id: Option<i32> = sqlx::query_scalar(
        "INSERT INTO groups (name, avatar, type, created_by, max_members, message_retention_days, is_public)
         VALUES ($1, '🎮', 'match', $2, $3, 3, false) RETURNING id"
    )
    .bind(format!("Match {}", code)).bind(user.id).bind(slots_count + 1)
    .fetch_optional(&state.pool).await.unwrap_or(None);

    if let Some(gid) = group_id {
        let _ = sqlx::query("INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)")
            .bind(gid).bind(user.id).execute(&state.pool).await;
        let _ = sqlx::query("UPDATE matches SET group_id = $1 WHERE id = $2")
            .bind(gid).bind(match_id).execute(&state.pool).await;
    }

    let m = match fetch_match(&state.pool, match_id).await {
        Some(m) => m,
        None => return err_json(StatusCode::INTERNAL_SERVER_ERROR, "Match not found after insert"),
    };

    let serialized = serialize_match(&state.pool, &m, Some(user.id)).await;

    let followers: Vec<i32> = sqlx::query_scalar(
        "SELECT follower_id FROM follows WHERE following_id = $1"
    )
    .bind(user.id).fetch_all(&state.pool).await.unwrap_or_default();
    let host_name_fallback = format!("@{}", user.handle.as_deref().unwrap_or(""));
    let host_name = user.name.as_deref().unwrap_or(&host_name_fallback);
    let fee_text = if entry_fee > 0.0 { format!("Entry: {:.0} GC", entry_fee) } else { "Free Entry".to_string() };
    let prize = serialized["showcasePrizePool"].as_f64().unwrap_or(0.0);
    let notif_msg = format!("🎮 {} ne ek naya match banaya! {} · {} · Prize: {:.0} GC", host_name, game, fee_text, prize);
    let pool = state.pool.clone();
    let notif_msg_clone = notif_msg.clone();
    let match_id_clone = match_id;
    tokio::spawn(async move {
        for fid in followers {
            notify(&pool, fid, "host_match_new", &notif_msg_clone, &format!("/matches/{}", match_id_clone)).await;
        }
    });

    ok_json(serialized)
}

// ─── GET /matches/:id ─────────────────────────────────────────────────────────

async fn get_match(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    let Some(m) = fetch_match(&state.pool, id).await else {
        return err_json(StatusCode::NOT_FOUND, "Match not found");
    };
    let mut serialized = serialize_match(&state.pool, &m, Some(user.id)).await;
    if m.host_id == user.id || user.role == "admin" {
        serialized["roomId"] = json!(m.room_id);
        serialized["roomPassword"] = json!(m.room_password);
    }
    ok_json(serialized)
}

// ─── DELETE /matches/:id ──────────────────────────────────────────────────────

async fn delete_match(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    let Some(m) = fetch_match(&state.pool, id).await else {
        return err_json(StatusCode::NOT_FOUND, "Match not found");
    };
    if m.host_id != user.id && user.role != "admin" {
        return err_json(StatusCode::FORBIDDEN, "Unauthorized");
    }
    if m.status == "completed" {
        return err_json(StatusCode::BAD_REQUEST, "Cannot delete a completed match. Rewards have already been distributed.");
    }

    #[derive(sqlx::FromRow)]
    struct Participant { id: i32, user_id: i32 }

    let participants: Vec<Participant> = sqlx::query_as(
        "SELECT id, user_id FROM match_participants WHERE match_id = $1"
    )
    .bind(m.id).fetch_all(&state.pool).await.unwrap_or_default();

    let fee = m.entry_fee * m.team_size as f64;
    for p in &participants {
        if fee > 0.0 {
            let _ = sqlx::query("UPDATE users SET balance = balance + $1 WHERE id = $2")
                .bind(fee).bind(p.user_id).execute(&state.pool).await;
            let _ = sqlx::query(
                "INSERT INTO match_escrow_transactions (match_id, user_id, type, amount) VALUES ($1,$2,'refund',$3)"
            )
            .bind(m.id).bind(p.user_id).bind(fee).execute(&state.pool).await;
        }
    }
    if m.host_stake > 0.0 {
        let _ = sqlx::query("UPDATE users SET balance = balance + $1 WHERE id = $2")
            .bind(m.host_stake).bind(m.host_id).execute(&state.pool).await;
        let _ = sqlx::query(
            "INSERT INTO match_escrow_transactions (match_id, user_id, type, amount) VALUES ($1,$2,'refund',$3)"
        )
        .bind(m.id).bind(m.host_id).bind(m.host_stake).execute(&state.pool).await;
    }
    let _ = sqlx::query("DELETE FROM match_players WHERE match_id = $1").bind(m.id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM match_participants WHERE match_id = $1").bind(m.id).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM matches WHERE id = $1").bind(m.id).execute(&state.pool).await;

    ok_json(json!({ "success": true, "message": "Match deleted and refunds processed" }))
}

// ─── POST /matches/:id/join ───────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JoinMatchBody {
    team_name: Option<String>,
    uid: Option<String>,
    players: Option<Vec<PlayerEntry>>,
}

#[derive(Deserialize)]
struct PlayerEntry {
    ign: Option<String>,
    uid: Option<String>,
}

async fn join_match(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<JoinMatchBody>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    let Some(m) = fetch_match(&state.pool, id).await else {
        return err_json(StatusCode::NOT_FOUND, "Match not found");
    };
    if m.status != "upcoming" {
        return err_json(StatusCode::BAD_REQUEST, "Match is not joinable");
    }
    if m.min_trust_score > user.trust_score {
        return err_json(
            StatusCode::FORBIDDEN,
            &format!("This match requires {}+ Trust Score. Your score is {}.", m.min_trust_score, user.trust_score),
        );
    }

    let already: Option<(i32,)> = sqlx::query_as(
        "SELECT id FROM match_participants WHERE match_id = $1 AND user_id = $2"
    )
    .bind(m.id).bind(user.id)
    .fetch_optional(&state.pool).await.unwrap_or(None);
    if already.is_some() {
        return err_json(StatusCode::BAD_REQUEST, "Already joined");
    }

    if m.team_size > 1 {
        match &body.players {
            Some(players) if players.len() as i32 == m.team_size => {
                if players.iter().any(|p| p.ign.is_none() || p.uid.is_none()) {
                    return err_json(StatusCode::BAD_REQUEST, "All players must have an IGN and UID.");
                }
            }
            _ => return err_json(StatusCode::BAD_REQUEST, &format!("Provide exactly {} players to join.", m.team_size)),
        }
    }

    let submitted_uids: Vec<String> = if let Some(ref players) = body.players {
        players.iter().filter_map(|p| p.uid.as_ref().map(|u| u.trim().to_string())).collect()
    } else {
        let u = body.uid.as_deref()
            .or(user.game_uid.as_deref())
            .unwrap_or("")
            .trim()
            .to_string();
        if u.is_empty() { vec![] } else { vec![u] }
    };

    let total_fee = m.entry_fee * if m.team_size > 1 { m.team_size as f64 } else { 1.0 };

    if !submitted_uids.is_empty() {
        let existing_uids: Vec<String> = sqlx::query_scalar(
            "SELECT uid FROM match_players WHERE match_id = $1"
        )
        .bind(m.id).fetch_all(&state.pool).await.unwrap_or_default();
        for uid in &submitted_uids {
            if existing_uids.contains(uid) {
                return err_json(StatusCode::BAD_REQUEST, &format!("UID \"{}\" is already registered in this match.", uid));
            }
        }
    }

    if total_fee > 0.0 {
        let ok: Option<(f64,)> = sqlx::query_as(
            "UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING balance"
        )
        .bind(total_fee).bind(user.id)
        .fetch_optional(&state.pool).await.unwrap_or(None);
        if ok.is_none() {
            return err_json(StatusCode::BAD_REQUEST, "Insufficient balance");
        }
    }

    let slot_result: Option<(i32,)> = sqlx::query_as(
        "UPDATE matches SET filled_slots = filled_slots + $1, escrow_balance = escrow_balance + $2
         WHERE id = $3 AND filled_slots + $1 <= slots RETURNING filled_slots"
    )
    .bind(m.team_size).bind(total_fee).bind(m.id)
    .fetch_optional(&state.pool).await.unwrap_or(None);

    if slot_result.is_none() {
        if total_fee > 0.0 {
            let _ = sqlx::query("UPDATE users SET balance = balance + $1 WHERE id = $2")
                .bind(total_fee).bind(user.id).execute(&state.pool).await;
        }
        return err_json(StatusCode::BAD_REQUEST, "Match is full");
    }

    let new_filled = slot_result.unwrap().0;
    let team_number = (new_filled as f64 / m.team_size as f64).ceil() as i32;

    let participant_id: i32 = sqlx::query_scalar(
        "INSERT INTO match_participants (match_id, user_id, team_name, team_number) VALUES ($1,$2,$3,$4) RETURNING id"
    )
    .bind(m.id).bind(user.id).bind(body.team_name.as_deref()).bind(team_number)
    .fetch_one(&state.pool).await.unwrap_or(0);

    let player_list: Vec<(String, String)> = if let Some(ref players) = body.players {
        players.iter().map(|p| (
            p.ign.clone().unwrap_or_default(),
            p.uid.clone().unwrap_or_default(),
        )).collect()
    } else {
        vec![(
            user.name.clone().unwrap_or_else(|| user.email.clone()),
            user.game_uid.clone().unwrap_or_else(|| format!("user-{}", user.id)),
        )]
    };

    for (i, (ign, uid)) in player_list.iter().enumerate() {
        let _ = sqlx::query(
            "INSERT INTO match_players (participant_id, match_id, ign, uid, position) VALUES ($1,$2,$3,$4,$5)"
        )
        .bind(participant_id).bind(m.id).bind(ign).bind(uid).bind((i + 1) as i32)
        .execute(&state.pool).await;
    }

    if total_fee > 0.0 {
        let _ = sqlx::query(
            "INSERT INTO match_escrow_transactions (match_id, user_id, type, amount) VALUES ($1,$2,'entry_fee',$3)"
        )
        .bind(m.id).bind(user.id).bind(total_fee).execute(&state.pool).await;
    }

    add_trust_score_event(&state.pool, user.id, "match_joined", 10, "Joined a tournament match", Some(m.id)).await;

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    if total_fee > 0.0 {
        add_trust_score_event(&state.pool, user.id, "match_fee_paid", 30, "Entry fee paid on time", Some(m.id)).await;
        let new_paid: Option<i32> = sqlx::query_scalar(
            "UPDATE users SET paid_matches_played = paid_matches_played + 1 WHERE id = $1 RETURNING paid_matches_played"
        )
        .bind(user.id).fetch_optional(&state.pool).await.unwrap_or(None).flatten();

        let paid_today: Option<i32> = sqlx::query_scalar(
            "UPDATE users SET
               daily_paid_matches = CASE WHEN daily_task_date = $2 THEN daily_paid_matches + 1 ELSE 1 END,
               daily_wins = CASE WHEN daily_task_date = $2 THEN daily_wins ELSE 0 END,
               daily_task_date = $2
             WHERE id = $1 RETURNING daily_paid_matches"
        )
        .bind(user.id).bind(&today)
        .fetch_optional(&state.pool).await.unwrap_or(None).flatten();
        if paid_today == Some(3) {
            let _ = sqlx::query("UPDATE users SET silver_coins = silver_coins + 10 WHERE id = $1")
                .bind(user.id).execute(&state.pool).await;
        }

        if new_paid == Some(5) {
            let referral: Option<(i32, i32)> = sqlx::query_as(
                "SELECT id, referrer_id FROM referrals WHERE referred_id = $1 AND completed = false"
            )
            .bind(user.id).fetch_optional(&state.pool).await.unwrap_or(None);
            if let Some((ref_id, referrer_id)) = referral {
                let _ = sqlx::query("UPDATE referrals SET completed = true, referrer_rewarded = true WHERE id = $1")
                    .bind(ref_id).execute(&state.pool).await;
                let _ = sqlx::query("UPDATE users SET balance = balance + 3 WHERE id = $1")
                    .bind(referrer_id).execute(&state.pool).await;
                let bonus_until = (chrono::Utc::now() + chrono::Duration::days(5)).format("%Y-%m-%d").to_string();
                let _ = sqlx::query("UPDATE users SET referral_bonus_until = $1 WHERE id = $2")
                    .bind(bonus_until).bind(user.id).execute(&state.pool).await;
            }
        }
    } else {
        let free_today: Option<i32> = sqlx::query_scalar(
            "UPDATE users SET
               daily_wins = CASE WHEN daily_task_date = $2 THEN daily_wins + 1 ELSE 1 END,
               daily_paid_matches = CASE WHEN daily_task_date = $2 THEN daily_paid_matches ELSE 0 END,
               daily_task_date = $2
             WHERE id = $1 RETURNING daily_wins"
        )
        .bind(user.id).bind(&today)
        .fetch_optional(&state.pool).await.unwrap_or(None).flatten();
        if free_today == Some(3) {
            let _ = sqlx::query("UPDATE users SET silver_coins = silver_coins + 10 WHERE id = $1")
                .bind(user.id).execute(&state.pool).await;
        }
    }

    if let Some(gid) = m.group_id {
        let already_member: Option<(i32,)> = sqlx::query_as(
            "SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2"
        )
        .bind(gid).bind(user.id).fetch_optional(&state.pool).await.unwrap_or(None);
        if already_member.is_none() {
            let _ = sqlx::query("INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)")
                .bind(gid).bind(user.id).execute(&state.pool).await;
        }
    }

    let pool = state.pool.clone();
    let host_id = m.host_id;
    let match_code = m.code.clone();
    let match_id_clone = m.id;
    tokio::spawn(async move {
        notify(&pool, host_id, "match_join", &format!("A player joined your match {}! 🎮", match_code), &format!("/matches/{}", match_id_clone)).await;
    });

    ok_json(json!({ "success": true, "message": "Joined successfully! Check the Room tab for credentials.", "groupId": m.group_id }))
}

// ─── PUT /matches/:id/room ────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RoomBody {
    room_id: Option<String>,
    room_password: Option<String>,
}

async fn update_room(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<RoomBody>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    let Some(m) = fetch_match(&state.pool, id).await else {
        return err_json(StatusCode::NOT_FOUND, "Match not found");
    };
    if m.host_id != user.id && user.role != "admin" {
        return err_json(StatusCode::FORBIDDEN, "Unauthorized");
    }

    let _ = sqlx::query(
        "UPDATE matches SET room_id = $1, room_password = $2, room_released = true WHERE id = $3"
    )
    .bind(body.room_id.as_deref()).bind(body.room_password.as_deref()).bind(m.id)
    .execute(&state.pool).await;

    let participants: Vec<i32> = sqlx::query_scalar(
        "SELECT user_id FROM match_participants WHERE match_id = $1"
    )
    .bind(m.id).fetch_all(&state.pool).await.unwrap_or_default();

    let label = m.code.clone();
    let rid = body.room_id.clone().unwrap_or_default();
    let rpass = body.room_password.clone().unwrap_or_default();
    let pwd_part = if rpass.is_empty() { String::new() } else { format!(" | Password: {}", rpass) };
    let notif_msg = format!("🎮 Room is ready for \"{}\"! Room ID: {}{} — Join now!", label, rid, pwd_part);

    let pool = state.pool.clone();
    let match_id_clone = m.id;
    tokio::spawn(async move {
        for uid in participants {
            notify(&pool, uid, "room_ready", &notif_msg, &format!("/matches/{}", match_id_clone)).await;
        }
    });

    ok_json(json!({ "success": true, "message": "Room credentials updated" }))
}

// ─── POST /matches/:id/go-live ────────────────────────────────────────────────

async fn go_live(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    let Some(m) = fetch_match(&state.pool, id).await else {
        return err_json(StatusCode::NOT_FOUND, "Match not found");
    };
    if m.host_id != user.id && user.role != "admin" {
        return err_json(StatusCode::FORBIDDEN, "Unauthorized");
    }

    let _ = sqlx::query("UPDATE matches SET status = 'live', escrow_status = 'locked' WHERE id = $1")
        .bind(m.id).execute(&state.pool).await;

    let participants: Vec<i32> = sqlx::query_scalar(
        "SELECT user_id FROM match_participants WHERE match_id = $1"
    )
    .bind(m.id).fetch_all(&state.pool).await.unwrap_or_default();

    let pool = state.pool.clone();
    let code = m.code.clone();
    let match_id_clone = m.id;
    tokio::spawn(async move {
        let msg = format!("Match {} has gone LIVE! 🔴 Get ready to play.", code);
        for uid in participants {
            notify(&pool, uid, "match_live", &msg, &format!("/matches/{}", match_id_clone)).await;
        }
    });

    ok_json(json!({ "success": true, "message": "Match is now live" }))
}

// ─── POST /matches/:id/submit-result ─────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitResultBody {
    results: Vec<ResultEntry>,
    screenshot_urls: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct ResultEntry {
    #[serde(rename = "participantId")]
    participant_id: i32,
    rank: i32,
    reward: f64,
}

async fn submit_result(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<SubmitResultBody>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    let Some(m) = fetch_match(&state.pool, id).await else {
        return err_json(StatusCode::NOT_FOUND, "Match not found");
    };
    if m.host_id != user.id && user.role != "admin" {
        return err_json(StatusCode::FORBIDDEN, "Unauthorized");
    }
    if m.status == "completed" {
        return err_json(StatusCode::BAD_REQUEST, "Result already submitted");
    }
    if body.results.is_empty() {
        return err_json(StatusCode::BAD_REQUEST, "Results are required");
    }
    if body.results.iter().any(|r| r.reward < 0.0) {
        return err_json(StatusCode::BAD_REQUEST, "All reward values must be non-negative numbers");
    }

    let entry_fee_pool = m.filled_slots as f64 * m.entry_fee;
    let host_percent = m.host_commission_percent / 100.0;
    let platform_percent = 0.05_f64;
    let max_winners_pool = f64::max(0.0, entry_fee_pool - entry_fee_pool * host_percent - entry_fee_pool * platform_percent);
    let host_cut = (entry_fee_pool * host_percent * 100.0).round() / 100.0;
    let platform_cut = (entry_fee_pool * platform_percent * 100.0).round() / 100.0;
    let total_reward: f64 = body.results.iter().map(|r| r.reward).sum();

    if total_reward > max_winners_pool + 0.01 {
        return err_json(
            StatusCode::BAD_REQUEST,
            &format!("Total rewards ({:.2} GC) exceed the winners pool ({:.2} GC)", total_reward, max_winners_pool),
        );
    }
    if total_reward + host_cut + platform_cut + m.host_stake > m.escrow_balance + 0.01 {
        return err_json(StatusCode::BAD_REQUEST, "Escrow balance is not enough for this distribution");
    }

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    for r in &body.results {
        let _ = sqlx::query(
            "UPDATE match_participants SET rank = $1, reward = $2 WHERE id = $3"
        )
        .bind(r.rank).bind(r.reward).bind(r.participant_id)
        .execute(&state.pool).await;

        if r.reward > 0.0 {
            let win_row: Option<(i32, i32)> = sqlx::query_as(
                r#"UPDATE users SET
                    balance = balance + $1,
                    tournament_wins = tournament_wins + 1,
                    daily_tournament_wins = CASE WHEN daily_task_date = $2 THEN daily_tournament_wins + 1 ELSE 1 END,
                    daily_task_date = $2
                   WHERE id = (SELECT user_id FROM match_participants WHERE id = $3)
                   RETURNING id, daily_tournament_wins"#
            )
            .bind(r.reward).bind(&today).bind(r.participant_id)
            .fetch_optional(&state.pool).await.unwrap_or(None);

            let winner_uid = win_row.map(|(uid, _)| uid);
            let _ = sqlx::query(
                "INSERT INTO match_escrow_transactions (match_id, user_id, type, amount) VALUES ($1,$2,'prize_payout',$3)"
            )
            .bind(m.id).bind(winner_uid).bind(r.reward).execute(&state.pool).await;

            if let Some((uid, dtw)) = win_row {
                if dtw == 5 {
                    let _ = sqlx::query("UPDATE users SET silver_coins = silver_coins + 10 WHERE id = $1")
                        .bind(uid).execute(&state.pool).await;
                }
            }
        }
    }

    let all_participants: Vec<i32> = sqlx::query_scalar(
        "SELECT user_id FROM match_participants WHERE match_id = $1"
    )
    .bind(m.id).fetch_all(&state.pool).await.unwrap_or_default();

    for uid in &all_participants {
        add_trust_score_event(&state.pool, *uid, "match_completed", 50, "Completed match without dispute", Some(m.id)).await;
    }

    if host_cut > 0.0 {
        let _ = sqlx::query("UPDATE users SET balance = balance + $1 WHERE id = $2")
            .bind(host_cut).bind(m.host_id).execute(&state.pool).await;
        let _ = sqlx::query(
            "INSERT INTO host_earnings (host_id, match_id, match_code, amount) VALUES ($1,$2,$3,$4)"
        )
        .bind(m.host_id).bind(m.id).bind(&m.code).bind(host_cut).execute(&state.pool).await;
        let _ = sqlx::query(
            "INSERT INTO match_escrow_transactions (match_id, user_id, type, amount) VALUES ($1,$2,'host_commission',$3)"
        )
        .bind(m.id).bind(m.host_id).bind(host_cut).execute(&state.pool).await;
    }

    if platform_cut > 0.0 {
        let _ = sqlx::query(
            "INSERT INTO platform_earnings (host_id, match_id, match_code, amount) VALUES ($1,$2,$3,$4)"
        )
        .bind(m.host_id).bind(m.id).bind(&m.code).bind(platform_cut).execute(&state.pool).await;
        let _ = sqlx::query(
            "INSERT INTO match_escrow_transactions (match_id, user_id, type, amount) VALUES ($1,NULL,'platform_fee',$2)"
        )
        .bind(m.id).bind(platform_cut).execute(&state.pool).await;
    }

    if m.host_stake > 0.0 {
        let _ = sqlx::query("UPDATE users SET balance = balance + $1 WHERE id = $2")
            .bind(m.host_stake).bind(m.host_id).execute(&state.pool).await;
        let _ = sqlx::query(
            "INSERT INTO match_escrow_transactions (match_id, user_id, type, amount) VALUES ($1,$2,'host_stake',$3)"
        )
        .bind(m.id).bind(m.host_id).bind(m.host_stake).execute(&state.pool).await;
    }

    let screenshots_json = serde_json::to_string(body.screenshot_urls.as_deref().unwrap_or(&[])).unwrap_or_default();
    let _ = sqlx::query(
        "UPDATE matches SET status = 'completed', result_screenshot_urls = $1,
         screenshot_uploaded_at = $2, escrow_balance = 0, escrow_status = 'distributed',
         prize_distributed_at = NOW() WHERE id = $3"
    )
    .bind(&screenshots_json)
    .bind(if body.screenshot_urls.as_ref().map(|u| !u.is_empty()).unwrap_or(false) { Some(chrono::Utc::now()) } else { None })
    .bind(m.id)
    .execute(&state.pool).await.ok();

    let pool = state.pool.clone();
    let match_code = m.code.clone();
    let match_id_clone = m.id;
    tokio::spawn(async move {
        let participants: Vec<(i32, Option<f64>)> = sqlx::query_as(
            "SELECT user_id, CAST(reward AS FLOAT8) FROM match_participants WHERE match_id = $1"
        )
        .bind(match_id_clone)
        .fetch_all(&pool).await.unwrap_or_default();
        for (uid, reward) in participants {
            let r = reward.unwrap_or(0.0);
            let msg = if r > 0.0 {
                format!("Match {} results are in! You won {:.0} GC 🏆", match_code, r)
            } else {
                format!("Match {} results are in. Better luck next time! 💪", match_code)
            };
            notify(&pool, uid, "match_result", &msg, &format!("/matches/{}", match_id_clone)).await;
        }
    });

    ok_json(json!({ "success": true, "message": "Result submitted and rewards distributed!" }))
}

// ─── GET /matches/:id/players ─────────────────────────────────────────────────

async fn get_players(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    let match_row = fetch_match(&state.pool, id).await;
    let can_see_full = match_row.as_ref().map(|m| m.host_id == user.id).unwrap_or(false) || user.role == "admin";

    let participants: Vec<DbParticipantFull> = sqlx::query_as(
        r#"SELECT mp.id, mp.user_id, mp.team_name, mp.team_number, mp.rank, mp.kills,
            CAST(mp.reward AS FLOAT8) AS reward,
            COALESCE(u.trust_score, 500) AS trust_score,
            COALESCE(u.trust_tier, 'bronze') AS trust_tier,
            u.name AS user_name,
            u.avatar AS user_avatar,
            u.handle AS user_handle
           FROM match_participants mp
           LEFT JOIN users u ON u.id = mp.user_id
           WHERE mp.match_id = $1
           ORDER BY mp.team_number"#
    )
    .bind(id).fetch_all(&state.pool).await.unwrap_or_default();

    let mut result = Vec::new();
    for p in &participants {
        let players: Vec<DbMatchPlayer> = sqlx::query_as(
            "SELECT ign, uid, position FROM match_players WHERE participant_id = $1 ORDER BY position"
        )
        .bind(p.id).fetch_all(&state.pool).await.unwrap_or_default();

        let players_json: Vec<Value> = players.into_iter().map(|pl| {
            let uid_display = if can_see_full {
                pl.uid.clone()
            } else {
                let len = pl.uid.len();
                if len <= 4 { pl.uid.clone() }
                else { format!("{}{}", "•".repeat(len - 4), &pl.uid[len - 4..]) }
            };
            json!({ "ign": pl.ign, "uid": uid_display, "position": pl.position })
        }).collect();

        result.push(json!({
            "id": p.id,
            "userId": p.user_id,
            "teamName": p.team_name,
            "teamNumber": p.team_number,
            "rank": p.rank,
            "reward": p.reward,
            "trustScore": p.trust_score,
            "trustTier": p.trust_tier,
            "userName": p.user_name,
            "userAvatar": p.user_avatar,
            "userHandle": if can_see_full { p.user_handle.clone() } else { None },
            "players": players_json,
            "kills": p.kills,
        }));
    }
    ok_json(json!(result))
}

// ─── PUT /matches/:id/leaderboard ────────────────────────────────────────────

#[derive(Deserialize)]
struct LeaderboardBody {
    entries: Vec<LeaderboardEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeaderboardEntry {
    participant_id: i32,
    kills: Option<i32>,
    rank: Option<i32>,
}

async fn update_leaderboard(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<LeaderboardBody>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    if body.entries.is_empty() {
        return err_json(StatusCode::BAD_REQUEST, "entries array is required");
    }
    let Some(m) = fetch_match(&state.pool, id).await else {
        return err_json(StatusCode::NOT_FOUND, "Match not found");
    };
    if user.id != m.host_id && user.role != "admin" {
        return err_json(StatusCode::FORBIDDEN, "Only the host can update the leaderboard");
    }

    for entry in &body.entries {
        let _ = sqlx::query(
            "UPDATE match_participants SET kills = $1, rank = $2 WHERE id = $3 AND match_id = $4"
        )
        .bind(entry.kills).bind(entry.rank).bind(entry.participant_id).bind(id)
        .execute(&state.pool).await;
    }

    ok_json(json!({ "success": true }))
}

// ─── DELETE /matches/:id/participants/:pid ────────────────────────────────────

async fn kick_participant(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((match_id, pid)): Path<(i32, i32)>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    let Some(m) = fetch_match(&state.pool, match_id).await else {
        return err_json(StatusCode::NOT_FOUND, "Match not found");
    };
    if user.id != m.host_id && user.role != "admin" {
        return err_json(StatusCode::FORBIDDEN, "Only the host can remove players");
    }
    if m.status == "completed" {
        return err_json(StatusCode::BAD_REQUEST, "Cannot kick players from a completed match");
    }

    let participant: Option<(i32,)> = sqlx::query_as(
        "SELECT user_id FROM match_participants WHERE id = $1 AND match_id = $2"
    )
    .bind(pid).bind(match_id)
    .fetch_optional(&state.pool).await.unwrap_or(None);

    let Some((part_user_id,)) = participant else {
        return err_json(StatusCode::NOT_FOUND, "Participant not found");
    };

    if m.entry_fee > 0.0 {
        let _ = sqlx::query("UPDATE users SET balance = balance + $1 WHERE id = $2")
            .bind(m.entry_fee).bind(part_user_id).execute(&state.pool).await;
        let _ = sqlx::query(
            "INSERT INTO match_escrow_transactions (match_id, user_id, type, amount) VALUES ($1,$2,'refund',$3)"
        )
        .bind(match_id).bind(part_user_id).bind(m.entry_fee).execute(&state.pool).await;
    }
    let _ = sqlx::query("DELETE FROM match_players WHERE participant_id = $1").bind(pid).execute(&state.pool).await;
    let _ = sqlx::query("DELETE FROM match_participants WHERE id = $1").bind(pid).execute(&state.pool).await;
    let _ = sqlx::query("UPDATE matches SET filled_slots = GREATEST(0, filled_slots - 1) WHERE id = $1")
        .bind(match_id).execute(&state.pool).await;

    ok_json(json!({ "success": true, "message": "Player kicked and entry fee refunded" }))
}

// ─── GET /players/:uid/matches ────────────────────────────────────────────────

async fn player_matches(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(target_user_id): Path<i32>,
) -> Response {
    let current_user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };

    let match_ids: Vec<i32> = sqlx::query_scalar(
        "SELECT match_id FROM match_participants WHERE user_id = $1"
    )
    .bind(target_user_id).fetch_all(&state.pool).await.unwrap_or_default();

    let mut results = Vec::new();
    for mid in match_ids {
        if let Some(m) = fetch_match(&state.pool, mid).await {
            results.push(serialize_match(&state.pool, &m, Some(current_user.id)).await);
        }
    }
    ok_json(json!(results))
}

// ─── GET /my-matches ──────────────────────────────────────────────────────────

async fn my_matches(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };

    if user.role == "host" || user.role == "admin" {
        let hosted_ids: Vec<i32> = sqlx::query_scalar("SELECT id FROM matches WHERE host_id = $1 ORDER BY created_at")
            .bind(user.id).fetch_all(&state.pool).await.unwrap_or_default();

        let mut all = Vec::new();
        for mid in hosted_ids {
            if let Some(m) = fetch_match(&state.pool, mid).await {
                all.push(serialize_match(&state.pool, &m, Some(user.id)).await);
            }
        }
        let participated: Vec<&Value> = all.iter().filter(|m| m["status"] != "completed").collect();
        let history: Vec<&Value> = all.iter().filter(|m| m["status"] == "completed").collect();
        return ok_json(json!({ "participated": participated, "history": history }));
    }

    let match_ids: Vec<i32> = sqlx::query_scalar(
        "SELECT match_id FROM match_participants WHERE user_id = $1"
    )
    .bind(user.id).fetch_all(&state.pool).await.unwrap_or_default();

    let mut all = Vec::new();
    for mid in match_ids {
        if let Some(m) = fetch_match(&state.pool, mid).await {
            all.push(serialize_match(&state.pool, &m, Some(user.id)).await);
        }
    }
    let participated: Vec<&Value> = all.iter().filter(|m| m["status"] != "completed").collect();
    let history: Vec<&Value> = all.iter().filter(|m| m["status"] == "completed").collect();
    ok_json(json!({ "participated": participated, "history": history }))
}

// ─── POST /matches/:id/review ─────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewBody {
    rating: Option<serde_json::Value>,
    overall_rating: Option<serde_json::Value>,
    comment: Option<String>,
    prize_on_time: Option<bool>,
    room_code_on_time: Option<bool>,
}

async fn post_review(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<ReviewBody>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    if user.role != "player" {
        return err_json(StatusCode::FORBIDDEN, "Only players can review hosts");
    }
    let Some(m) = fetch_match(&state.pool, id).await else {
        return err_json(StatusCode::NOT_FOUND, "Match not found");
    };
    if m.status != "completed" {
        return err_json(StatusCode::BAD_REQUEST, "Can only review completed matches");
    }

    let participated: Option<(i32,)> = sqlx::query_as(
        "SELECT id FROM match_participants WHERE match_id = $1 AND user_id = $2"
    )
    .bind(id).bind(user.id).fetch_optional(&state.pool).await.unwrap_or(None);
    if participated.is_none() {
        return err_json(StatusCode::FORBIDDEN, "You did not participate in this match");
    }

    let existing: Option<(i32,)> = sqlx::query_as(
        "SELECT id FROM host_ratings WHERE match_id = $1 AND rater_id = $2"
    )
    .bind(id).bind(user.id).fetch_optional(&state.pool).await.unwrap_or(None);
    if existing.is_some() {
        return err_json(StatusCode::BAD_REQUEST, "You have already reviewed this match");
    }

    let parsed_rating = body.overall_rating.as_ref().or(body.rating.as_ref())
        .and_then(|v| match v {
            Value::Number(n) => n.as_i64().map(|x| x as i32),
            Value::String(s) => s.parse().ok(),
            _ => None,
        });
    let Some(rating_val) = parsed_rating else {
        return err_json(StatusCode::BAD_REQUEST, "Rating must be between 1 and 5");
    };
    if rating_val < 1 || rating_val > 5 {
        return err_json(StatusCode::BAD_REQUEST, "Rating must be between 1 and 5");
    }

    let prize_on_time = body.prize_on_time.unwrap_or(true);
    let room_code_on_time = body.room_code_on_time.unwrap_or(true);

    let _ = sqlx::query(
        "INSERT INTO host_ratings (match_id, rater_id, host_id, prize_on_time, room_code_on_time, overall_rating)
         VALUES ($1,$2,$3,$4,$5,$6)"
    )
    .bind(id).bind(user.id).bind(m.host_id)
    .bind(prize_on_time).bind(room_code_on_time).bind(rating_val)
    .execute(&state.pool).await;

    let _ = sqlx::query(
        "INSERT INTO host_reviews (match_id, reviewer_id, host_id, rating, comment)
         VALUES ($1,$2,$3,$4,$5)"
    )
    .bind(id).bind(user.id).bind(m.host_id).bind(rating_val)
    .bind(body.comment.as_deref().filter(|s| !s.is_empty()))
    .execute(&state.pool).await;

    let avg_rating: f64 = sqlx::query_scalar(
        "SELECT COALESCE(CAST(AVG(overall_rating) AS FLOAT8), 0) FROM host_ratings WHERE host_id = $1"
    )
    .bind(m.host_id).fetch_one(&state.pool).await.unwrap_or(0.0);
    let rating_count: i32 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM host_ratings WHERE host_id = $1"
    )
    .bind(m.host_id).fetch_one(&state.pool).await.unwrap_or(0);
    let hosted_count: i32 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM matches WHERE host_id = $1 AND status::TEXT = 'completed'"
    )
    .bind(m.host_id).fetch_one(&state.pool).await.unwrap_or(0);
    let new_badge = get_host_badge(hosted_count, avg_rating);

    let _ = sqlx::query(
        "UPDATE users SET host_rating_avg = $1, host_rating_count = $2, host_badge = $3 WHERE id = $4"
    )
    .bind(avg_rating).bind(rating_count).bind(new_badge).bind(m.host_id)
    .execute(&state.pool).await;

    ok_json(json!({ "success": true }))
}

// ─── GET /matches/:id/bracket ─────────────────────────────────────────────────

async fn get_bracket(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    let _user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    let row: Option<(i32, String)> = sqlx::query_as(
        "SELECT match_id, bracket_data FROM tournament_brackets WHERE match_id = $1"
    )
    .bind(id).fetch_optional(&state.pool).await.unwrap_or(None);
    let Some((match_id, bracket_data_str)) = row else {
        return err_json(StatusCode::NOT_FOUND, "No bracket found");
    };
    let bracket_data: Value = serde_json::from_str(&bracket_data_str).unwrap_or(json!({}));
    ok_json(json!({ "matchId": match_id, "bracketData": bracket_data }))
}

// ─── POST /matches/:id/bracket ────────────────────────────────────────────────

async fn create_bracket(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    let Some(m) = fetch_match(&state.pool, id).await else {
        return err_json(StatusCode::NOT_FOUND, "Match not found");
    };
    if m.host_id != user.id && user.role != "admin" {
        return err_json(StatusCode::FORBIDDEN, "Not authorized");
    }
    if !m.is_esports_only {
        return err_json(StatusCode::BAD_REQUEST, "Brackets are only for esports matches");
    }

    let existing: Option<(i32,)> = sqlx::query_as(
        "SELECT id FROM tournament_brackets WHERE match_id = $1"
    )
    .bind(id).fetch_optional(&state.pool).await.unwrap_or(None);
    if existing.is_some() {
        return err_json(StatusCode::BAD_REQUEST, "Bracket already exists");
    }

    let teams: Vec<(Option<String>, i32)> = sqlx::query_as(
        "SELECT team_name, team_number FROM match_participants WHERE match_id = $1 ORDER BY team_number"
    )
    .bind(id).fetch_all(&state.pool).await.unwrap_or_default();

    if teams.len() < 2 {
        return err_json(StatusCode::BAD_REQUEST, "Need at least 2 teams to create a bracket");
    }

    let team_names: Vec<String> = teams.into_iter().enumerate()
        .map(|(i, (name, num))| name.unwrap_or_else(|| format!("Team {}", num)))
        .collect();
    let n = team_names.len();

    let mut slots = 1usize;
    while slots < n { slots *= 2; }
    let total_rounds = (slots as f64).log2() as usize;
    let round_names = ["Round of 16", "Quarter-Final", "Semi-Final", "Final"];

    let mut rounds = Vec::new();
    for r in 0..total_rounds {
        let match_count = slots / (1 << (r + 1));
        let name = round_names.get(round_names.len().saturating_sub(total_rounds - r))
            .unwrap_or(&"Round")
            .to_string();
        let matches: Vec<Value> = (0..match_count).map(|i| {
            let team1 = if r == 0 { team_names.get(i * 2).cloned() } else { None };
            let team2 = if r == 0 { team_names.get(i * 2 + 1).cloned() } else { None };
            let winner = if r == 0 && team1.is_some() && team2.is_none() { team1.clone() } else { None };
            json!({ "id": format!("r{}m{}", r+1, i+1), "team1": team1, "team2": team2, "winner": winner })
        }).collect();
        rounds.push(json!({ "name": name, "roundNumber": r + 1, "matches": matches }));
    }

    let bracket_data = json!({ "rounds": rounds });
    let bracket_str = bracket_data.to_string();
    let _ = sqlx::query(
        "INSERT INTO tournament_brackets (match_id, bracket_data) VALUES ($1,$2)"
    )
    .bind(id).bind(&bracket_str).execute(&state.pool).await;

    ok_json(json!({ "matchId": id, "bracketData": bracket_data }))
}

// ─── PUT /matches/:id/bracket ─────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateBracketBody {
    bracket_data: Option<Value>,
}

async fn update_bracket(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<UpdateBracketBody>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    let Some(m) = fetch_match(&state.pool, id).await else {
        return err_json(StatusCode::NOT_FOUND, "Match not found");
    };
    if m.host_id != user.id && user.role != "admin" {
        return err_json(StatusCode::FORBIDDEN, "Not authorized");
    }
    let Some(bracket_data) = body.bracket_data else {
        return err_json(StatusCode::BAD_REQUEST, "bracketData required");
    };
    let bracket_str = bracket_data.to_string();
    let _ = sqlx::query(
        "UPDATE tournament_brackets SET bracket_data = $1, updated_at = NOW() WHERE match_id = $2"
    )
    .bind(&bracket_str).bind(id).execute(&state.pool).await;
    ok_json(json!({ "matchId": id, "bracketData": bracket_data }))
}

// ─── GET /admin/matches ───────────────────────────────────────────────────────

async fn admin_list_matches(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u, Err(r) => return r,
    };
    if user.role != "admin" {
        return err_json(StatusCode::FORBIDDEN, "Forbidden");
    }

    let sql = if let Some(status) = q.get("status").filter(|s| *s != "all") {
        format!("SELECT {} FROM matches WHERE status::TEXT = '{}' ORDER BY created_at", MATCH_COLS, status.replace('\'', ""))
    } else {
        format!("SELECT {} FROM matches ORDER BY created_at", MATCH_COLS)
    };

    let matches: Vec<DbMatch> = sqlx::query_as::<_, DbMatch>(&sql)
        .fetch_all(&state.pool).await.unwrap_or_default();

    let mut serialized = Vec::new();
    for m in &matches {
        serialized.push(serialize_match(&state.pool, m, Some(user.id)).await);
    }
    ok_json(json!(serialized))
}

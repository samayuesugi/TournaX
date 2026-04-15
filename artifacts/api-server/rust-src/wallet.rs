use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Arc};

use crate::AppState;
use crate::auth::{auth_user, err_json, ok_json};

// ─── Constants ────────────────────────────────────────────────────────────────

const SILVER_TO_GOLD_RATE: i64 = 100;
const GOLD_PER_CONVERSION: i64 = 1;
const MIN_ADD_BALANCE: f64 = 10.0;

// ─── DB Row Types ─────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct AddBalanceRow {
    id: i32,
    amount: f64,
    status: String,
    created_at: Option<DateTime<Utc>>,
    utr_number: String,
}

#[derive(sqlx::FromRow)]
struct WithdrawalRow {
    id: i32,
    amount: f64,
    status: String,
    created_at: Option<DateTime<Utc>>,
    upi_id: String,
}

#[derive(sqlx::FromRow)]
struct HostEarningRow {
    id: i32,
    match_code: String,
    amount: f64,
    created_at: Option<DateTime<Utc>>,
}

#[derive(sqlx::FromRow)]
struct EscrowTxRow {
    id: i32,
    match_id: i32,
    #[sqlx(rename = "type")]
    tx_type: String,
    amount: f64,
    created_at: Option<DateTime<Utc>>,
}

#[derive(sqlx::FromRow)]
struct MatchCodeRow {
    id: i32,
    code: Option<String>,
}

// ─── Request Bodies ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct AddBalanceBody {
    #[serde(rename = "utrNumber")]
    utr_number: Option<String>,
    amount: Option<serde_json::Value>,
    #[serde(rename = "receiptUrl")]
    receipt_url: Option<String>,
}

#[derive(Deserialize)]
struct WithdrawBody {
    amount: Option<serde_json::Value>,
    #[serde(rename = "upiId")]
    upi_id: Option<String>,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn iso(dt: Option<DateTime<Utc>>) -> String {
    dt.unwrap_or_else(Utc::now).to_rfc3339()
}

fn parse_amount(val: &serde_json::Value) -> Option<f64> {
    match val {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => s.parse::<f64>().ok(),
        _ => None,
    }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async fn get_wallet(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u,
        Err(r) => return r,
    };

    let pool = &state.pool;

    let add_history: Vec<AddBalanceRow> = sqlx::query_as(
        "SELECT id, CAST(amount AS FLOAT8) AS amount, status::TEXT AS status, created_at, utr_number \
         FROM add_balance_requests WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(user.id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let withdraw_history: Vec<WithdrawalRow> = sqlx::query_as(
        "SELECT id, CAST(amount AS FLOAT8) AS amount, status::TEXT AS status, created_at, upi_id \
         FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(user.id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let escrow_txs: Vec<EscrowTxRow> = sqlx::query_as(
        "SELECT id, match_id, type, CAST(amount AS FLOAT8) AS amount, created_at \
         FROM match_escrow_transactions \
         WHERE user_id = $1 AND type IN ('entry_fee','prize_payout') \
         ORDER BY created_at DESC",
    )
    .bind(user.id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let match_ids: Vec<i32> = {
        let mut seen = std::collections::HashSet::new();
        escrow_txs.iter().filter(|t| seen.insert(t.match_id)).map(|t| t.match_id).collect()
    };

    let mut match_code_map: HashMap<i32, String> = HashMap::new();
    if !match_ids.is_empty() {
        let placeholders: String = match_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("${}", i + 1))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT id, code FROM matches WHERE id IN ({})",
            placeholders
        );
        let mut q = sqlx::query_as::<_, MatchCodeRow>(&sql);
        for id in &match_ids {
            q = q.bind(id);
        }
        if let Ok(rows) = q.fetch_all(pool).await {
            for row in rows {
                match_code_map.insert(row.id, row.code.unwrap_or_else(|| row.id.to_string()));
            }
        }
    }

    let won_history: Vec<Value> = escrow_txs
        .iter()
        .filter(|t| t.tx_type == "prize_payout")
        .map(|t| {
            let code = match_code_map
                .get(&t.match_id)
                .cloned()
                .unwrap_or_else(|| t.match_id.to_string());
            json!({ "id": t.id, "amount": t.amount, "matchCode": code, "createdAt": iso(t.created_at) })
        })
        .collect();

    let spent_history: Vec<Value> = escrow_txs
        .iter()
        .filter(|t| t.tx_type == "entry_fee")
        .map(|t| {
            let code = match_code_map
                .get(&t.match_id)
                .cloned()
                .unwrap_or_else(|| t.match_id.to_string());
            json!({ "id": t.id, "amount": t.amount, "matchCode": code, "createdAt": iso(t.created_at) })
        })
        .collect();

    let mut earnings_history: Vec<Value> = Vec::new();
    if user.role == "host" || user.role == "admin" {
        let earnings: Vec<HostEarningRow> = sqlx::query_as(
            "SELECT id, match_code, CAST(amount AS FLOAT8) AS amount, created_at \
             FROM host_earnings WHERE host_id = $1 ORDER BY created_at DESC",
        )
        .bind(user.id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        earnings_history = earnings
            .iter()
            .map(|e| {
                json!({ "id": e.id, "matchCode": e.match_code, "amount": e.amount, "createdAt": iso(e.created_at) })
            })
            .collect();
    }

    let add_bal_json: Vec<Value> = add_history
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "amount": r.amount,
                "status": r.status,
                "createdAt": iso(r.created_at),
                "note": r.utr_number,
            })
        })
        .collect();

    let withdraw_json: Vec<Value> = withdraw_history
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "amount": r.amount,
                "status": r.status,
                "createdAt": iso(r.created_at),
                "note": r.upi_id,
            })
        })
        .collect();

    ok_json(json!({
        "balance": user.balance,
        "silverCoins": user.silver_coins,
        "upiId": std::env::var("ADMIN_UPI_ID").unwrap_or_default(),
        "role": user.role,
        "addBalanceHistory": add_bal_json,
        "withdrawalHistory": withdraw_json,
        "wonHistory": won_history,
        "spentHistory": spent_history,
        "earningsHistory": earnings_history,
    }))
}

async fn add_balance(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AddBalanceBody>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u,
        Err(r) => return r,
    };

    let utr_raw = body.utr_number.unwrap_or_default();
    let normalized_utr = utr_raw.trim().replace(char::is_whitespace, "").to_uppercase();
    let receipt_url = body.receipt_url.unwrap_or_default().trim().to_string();

    if normalized_utr.is_empty() || body.amount.is_none() {
        return err_json(StatusCode::BAD_REQUEST, "UTR and amount required");
    }

    let utr_len = normalized_utr.len();
    let utr_valid = utr_len >= 6
        && utr_len <= 30
        && normalized_utr.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !utr_valid {
        return err_json(StatusCode::BAD_REQUEST, "Please enter a valid UTR/reference number");
    }

    if receipt_url.is_empty() {
        return err_json(StatusCode::BAD_REQUEST, "Payment receipt is required");
    }

    let numeric_amount = match body.amount.as_ref().and_then(|v| parse_amount(v)) {
        Some(a) if a >= MIN_ADD_BALANCE => a,
        _ => return err_json(StatusCode::BAD_REQUEST, &format!("Minimum add amount is {} Gold Coins", MIN_ADD_BALANCE as i32)),
    };

    let existing: Option<(i32,)> = sqlx::query_as(
        "SELECT id FROM add_balance_requests WHERE utr_number = $1",
    )
    .bind(&normalized_utr)
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten();

    if existing.is_some() {
        return err_json(StatusCode::CONFLICT, "This UTR/reference number has already been submitted");
    }

    let insert_result = sqlx::query(
        "INSERT INTO add_balance_requests (user_id, utr_number, amount, receipt_url, status) \
         VALUES ($1, $2, $3, $4, 'pending')",
    )
    .bind(user.id)
    .bind(&normalized_utr)
    .bind(numeric_amount.to_string())
    .bind(&receipt_url)
    .execute(&state.pool)
    .await;

    match insert_result {
        Ok(_) => ok_json(json!({ "success": true, "message": "Request submitted successfully" })),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("23505") || msg.contains("unique") {
                err_json(StatusCode::CONFLICT, "This UTR/reference number has already been submitted")
            } else {
                err_json(StatusCode::INTERNAL_SERVER_ERROR, "Failed to submit request")
            }
        }
    }
}

async fn withdraw(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<WithdrawBody>,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u,
        Err(r) => return r,
    };

    let upi_id = match body.upi_id.filter(|s| !s.is_empty()) {
        Some(u) => u,
        None => return err_json(StatusCode::BAD_REQUEST, "Amount and UPI ID required"),
    };

    let numeric_amount = match body.amount.as_ref().and_then(|v| parse_amount(v)) {
        Some(a) => a,
        None => return err_json(StatusCode::BAD_REQUEST, "Amount and UPI ID required"),
    };

    if numeric_amount <= 0.0 {
        return err_json(StatusCode::BAD_REQUEST, "Invalid amount");
    }
    if numeric_amount < 10.0 {
        return err_json(StatusCode::BAD_REQUEST, "Minimum withdrawal amount is 10 Gold Coins");
    }

    let mut tx = match state.pool.begin().await {
        Ok(t) => t,
        Err(_) => return err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
    };

    let rows_affected = sqlx::query(
        "UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1",
    )
    .bind(numeric_amount)
    .bind(user.id)
    .execute(&mut *tx)
    .await
    .map(|r| r.rows_affected())
    .unwrap_or(0);

    if rows_affected == 0 {
        let _ = tx.rollback().await;
        return err_json(StatusCode::BAD_REQUEST, "Insufficient balance");
    }

    let insert_ok = sqlx::query(
        "INSERT INTO withdrawal_requests (user_id, amount, upi_id, status) VALUES ($1, $2, $3, 'pending')",
    )
    .bind(user.id)
    .bind(numeric_amount.to_string())
    .bind(&upi_id)
    .execute(&mut *tx)
    .await
    .is_ok();

    if !insert_ok {
        let _ = tx.rollback().await;
        return err_json(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create withdrawal request");
    }

    if tx.commit().await.is_err() {
        return err_json(StatusCode::INTERNAL_SERVER_ERROR, "Transaction failed");
    }

    ok_json(json!({ "success": true, "message": "Withdrawal requested" }))
}

async fn convert_silver(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    let user = match auth_user(&state, &headers).await {
        Ok(u) => u,
        Err(r) => return r,
    };

    let current_silver = user.silver_coins as i64;
    if current_silver < SILVER_TO_GOLD_RATE {
        return err_json(
            StatusCode::BAD_REQUEST,
            &format!(
                "You need at least {} Silver Coins to convert. You have {}.",
                SILVER_TO_GOLD_RATE, current_silver
            ),
        );
    }

    let batches = current_silver / SILVER_TO_GOLD_RATE;
    let silver_to_spend = batches * SILVER_TO_GOLD_RATE;
    let gold_to_earn = batches * GOLD_PER_CONVERSION;

    let mut tx = match state.pool.begin().await {
        Ok(t) => t,
        Err(_) => return err_json(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
    };

    let rows_affected = sqlx::query(
        "UPDATE users SET silver_coins = silver_coins - $1, balance = balance + $2 \
         WHERE id = $3 AND silver_coins >= $1",
    )
    .bind(silver_to_spend)
    .bind(gold_to_earn as f64)
    .bind(user.id)
    .execute(&mut *tx)
    .await
    .map(|r| r.rows_affected())
    .unwrap_or(0);

    if rows_affected == 0 {
        let _ = tx.rollback().await;
        return err_json(StatusCode::BAD_REQUEST, "Insufficient Silver Coins. Please try again.");
    }

    if tx.commit().await.is_err() {
        return err_json(StatusCode::INTERNAL_SERVER_ERROR, "Transaction failed");
    }

    ok_json(json!({
        "success": true,
        "message": format!("Converted {} Silver Coins into {} Gold Coins!", silver_to_spend, gold_to_earn),
    }))
}

// ─── Router ───────────────────────────────────────────────────────────────────

pub fn wallet_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wallet", get(get_wallet))
        .route("/wallet/add-balance", post(add_balance))
        .route("/wallet/withdraw", post(withdraw))
        .route("/wallet/convert-silver", post(convert_silver))
}

mod auth;
mod email;
mod wallet;

use auth::OtpEntry;
use axum::{
    body::{Body, Bytes},
    extract::{OriginalUri, State},
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, get},
    Json, Router,
};
use dashmap::DashMap;
use reqwest::Client;
use serde_json::json;
use sqlx::PgPool;
use std::{
    env,
    net::SocketAddr,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Arc,
    time::Duration,
};
use tokio::time::sleep;
use tracing::{error, info, warn};

// ─── Shared State ─────────────────────────────────────────────────────────────

pub struct AppState {
    pub client: Client,
    pub legacy_base_url: String,
    pub pool: PgPool,
    pub otp_store: Arc<DashMap<String, OtpEntry>>,
    pub jwt_secret: String,
    pub gmail_user: String,
    pub gmail_pass: String,
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()))
        .init();

    let port = env::var("PORT")
        .expect("PORT environment variable is required")
        .parse::<u16>()
        .expect("PORT must be a valid port number");

    let legacy_port = env::var("LEGACY_API_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(9090);

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL is required");
    let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET is required");
    let gmail_user = env::var("GMAIL_USER").unwrap_or_default();
    let gmail_pass = env::var("GMAIL_APP_PASSWORD").unwrap_or_default();

    let pool = PgPool::connect(&database_url)
        .await
        .expect("failed to connect to PostgreSQL");
    info!("connected to PostgreSQL");

    let mut legacy = start_legacy_server(legacy_port).expect("failed to start legacy API server");
    let legacy_base_url = format!("http://127.0.0.1:{legacy_port}");

    wait_for_legacy(&legacy_base_url).await;

    let state = Arc::new(AppState {
        client: Client::new(),
        legacy_base_url,
        pool,
        otp_store: Arc::new(DashMap::new()),
        jwt_secret,
        gmail_user,
        gmail_pass,
    });

    let app = Router::new()
        .route("/api/healthz", get(healthz))
        .nest("/api", auth::auth_router())
        .nest("/api", wallet::wallet_router())
        .fallback(any(proxy_to_legacy))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!(port, legacy_port, "Rust API gateway listening (auth handled natively)");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind API gateway");

    let result = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await;

    if let Err(err) = legacy.kill() {
        warn!(error = %err, "failed to stop legacy API server");
    }

    if let Err(err) = result {
        error!(error = %err, "API gateway failed");
    }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async fn healthz() -> impl IntoResponse {
    let mut response = Json(json!({ "status": "ok", "backend": "rust", "auth": "native" })).into_response();
    add_cors_headers(response.headers_mut());
    response
}

async fn proxy_to_legacy(
    State(state): State<Arc<AppState>>,
    method: Method,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if method == Method::OPTIONS {
        let mut response = StatusCode::NO_CONTENT.into_response();
        add_cors_headers(response.headers_mut());
        return response;
    }

    let url = format!("{}{}", state.legacy_base_url, uri);
    let request_method = match reqwest::Method::from_bytes(method.as_str().as_bytes()) {
        Ok(m) => m,
        Err(_) => return status_json(StatusCode::METHOD_NOT_ALLOWED, "Unsupported method"),
    };

    let mut request = state.client.request(request_method, url);
    for (name, value) in headers.iter() {
        if is_hop_by_hop_header(name.as_str()) || name.as_str().eq_ignore_ascii_case("host") {
            continue;
        }
        request = request.header(name.as_str(), value.as_bytes());
    }

    match request.body(body).send().await {
        Ok(upstream) => {
            let status = upstream.status();
            let upstream_headers = upstream.headers().clone();
            match upstream.bytes().await {
                Ok(bytes) => {
                    let mut response = Response::builder()
                        .status(status)
                        .body(Body::from(bytes))
                        .unwrap();
                    copy_response_headers(&upstream_headers, response.headers_mut());
                    add_cors_headers(response.headers_mut());
                    response
                }
                Err(err) => {
                    error!(error = %err, "failed to read legacy response");
                    status_json(StatusCode::BAD_GATEWAY, "Legacy API response failed")
                }
            }
        }
        Err(err) => {
            error!(error = %err, "legacy API request failed");
            status_json(StatusCode::BAD_GATEWAY, "Legacy API unavailable")
        }
    }
}

// ─── Legacy Server ────────────────────────────────────────────────────────────

fn start_legacy_server(port: u16) -> std::io::Result<Child> {
    let entry = legacy_entry_path();
    info!(port, "starting legacy API fallback");
    Command::new("node")
        .arg("--enable-source-maps")
        .arg(entry)
        .env("PORT", port.to_string())
        .env("LEGACY_API_PORT", port.to_string())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
}

fn legacy_entry_path() -> PathBuf {
    if let Ok(path) = env::var("LEGACY_API_ENTRY") {
        return PathBuf::from(path);
    }
    let candidates = [
        PathBuf::from("./dist/index.mjs"),
        PathBuf::from("artifacts/api-server/dist/index.mjs"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("dist/index.mjs"),
    ];
    candidates
        .into_iter()
        .find(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from("./dist/index.mjs"))
}

async fn wait_for_legacy(base_url: &str) {
    let client = Client::new();
    let health_url = format!("{base_url}/api/healthz");
    for _ in 0..50 {
        match client.get(&health_url).send().await {
            Ok(r) if r.status().is_success() => {
                info!("legacy API fallback is ready");
                return;
            }
            _ => sleep(Duration::from_millis(200)).await,
        }
    }
    warn!("legacy API fallback did not pass health check before gateway startup");
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install terminate signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

fn status_json(status: StatusCode, message: &str) -> Response {
    let mut response = (status, Json(json!({ "error": message }))).into_response();
    add_cors_headers(response.headers_mut());
    response
}

pub fn add_cors_headers(headers: &mut HeaderMap) {
    headers.insert("access-control-allow-origin", HeaderValue::from_static("*"));
    headers.insert(
        "access-control-allow-methods",
        HeaderValue::from_static("GET,POST,PUT,PATCH,DELETE,OPTIONS"),
    );
    headers.insert(
        "access-control-allow-headers",
        HeaderValue::from_static("authorization,content-type,accept"),
    );
}

fn copy_response_headers(source: &reqwest::header::HeaderMap, target: &mut HeaderMap) {
    for (name, value) in source.iter() {
        if is_hop_by_hop_header(name.as_str()) {
            continue;
        }
        if let (Ok(hn), Ok(hv)) = (
            HeaderName::from_bytes(name.as_str().as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            target.insert(hn, hv);
        }
    }
}

fn is_hop_by_hop_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

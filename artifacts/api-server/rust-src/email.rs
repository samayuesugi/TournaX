use lettre::{
    message::header::ContentType, AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    transport::smtp::authentication::Credentials,
};

pub async fn send_otp_email(
    to: &str,
    otp: &str,
    purpose: &str,
    gmail_user: &str,
    gmail_pass: &str,
) -> Result<(), String> {
    let action = if purpose == "register" {
        "complete your registration"
    } else {
        "reset your password"
    };
    let subject = if purpose == "register" {
        "TournaX - Verify Your Email"
    } else {
        "TournaX - Reset Your Password"
    };

    let html = format!(
        r#"<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0f0f13;color:#ffffff;border-radius:12px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px;text-align:center;">
    <h1 style="margin:0;font-size:28px;font-weight:800;letter-spacing:-1px;">TournaX</h1>
    <p style="margin:6px 0 0;opacity:0.85;font-size:13px;">Compete. Win. Dominate.</p>
  </div>
  <div style="padding:32px;">
    <h2 style="margin:0 0 8px;font-size:20px;">Your Verification Code</h2>
    <p style="color:#a0a0b0;font-size:14px;margin:0 0 24px;">Use the code below to {action}. It expires in <strong style="color:#fff">10 minutes</strong>.</p>
    <div style="background:#1e1e2e;border:2px solid #7c3aed;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
      <span style="font-size:40px;font-weight:900;letter-spacing:12px;color:#a78bfa;">{otp}</span>
    </div>
    <p style="color:#a0a0b0;font-size:12px;margin:0;">If you didn't request this, you can safely ignore this email.</p>
  </div>
</div>"#,
        action = action,
        otp = otp,
    );

    let from_addr: lettre::message::Mailbox = format!("TournaX <{}>", gmail_user)
        .parse()
        .map_err(|e| format!("invalid from address: {}", e))?;
    let to_addr: lettre::message::Mailbox = to
        .parse()
        .map_err(|e| format!("invalid to address: {}", e))?;

    let email = Message::builder()
        .from(from_addr)
        .to(to_addr)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(html)
        .map_err(|e| format!("email build error: {}", e))?;

    let creds = Credentials::new(gmail_user.to_string(), gmail_pass.to_string());
    let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay("smtp.gmail.com")
        .map_err(|e| format!("smtp relay error: {}", e))?
        .credentials(creds)
        .build();

    mailer
        .send(email)
        .await
        .map_err(|e| format!("send error: {}", e))?;

    Ok(())
}

import nodemailer from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

function getTransporter() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD environment variables must be set");
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });
}

export async function sendOtpEmail(to: string, otp: string, purpose: "register" | "reset"): Promise<void> {
  const transporter = getTransporter();
  const subject = purpose === "register" ? "TournaX - Verify Your Email" : "TournaX - Reset Your Password";
  const action = purpose === "register" ? "complete your registration" : "reset your password";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f0f13; color: #ffffff; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 32px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -1px;">TournaX</h1>
        <p style="margin: 6px 0 0; opacity: 0.85; font-size: 13px;">Compete. Win. Dominate.</p>
      </div>
      <div style="padding: 32px;">
        <h2 style="margin: 0 0 8px; font-size: 20px;">Your Verification Code</h2>
        <p style="color: #a0a0b0; font-size: 14px; margin: 0 0 24px;">Use the code below to ${action}. It expires in <strong style="color:#fff">10 minutes</strong>.</p>
        <div style="background: #1e1e2e; border: 2px solid #7c3aed; border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 40px; font-weight: 900; letter-spacing: 12px; color: #a78bfa;">${otp}</span>
        </div>
        <p style="color: #a0a0b0; font-size: 12px; margin: 0;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"TournaX" <${GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

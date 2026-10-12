import { env } from "../config/env.js";

type PasswordResetEmail = {
  email: string;
  token: string;
  idempotencyKey: string;
};

export async function sendPasswordResetEmail(input: PasswordResetEmail) {
  if (!env.RESEND_API_KEY) return;

  const resetUrl = new URL("/reset-password", env.PUBLIC_APP_URL);
  resetUrl.searchParams.set("token", input.token);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.email],
      subject: "Reset your Rally password",
      text: `Reset your Rally password: ${resetUrl.toString()}\n\nThis link expires in 1 hour.`,
      html: passwordResetEmailHtml(resetUrl.toString())
    }),
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Password reset email delivery failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

function passwordResetEmailHtml(resetUrl: string) {
  const safeUrl = escapeHtml(resetUrl);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f7f6;color:#17211d;font-family:Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px">
      <h1 style="font-size:28px;margin:0 0 12px">Rally</h1>
      <p style="font-size:17px;line-height:1.5">Use this secure link to choose a new Rally password.</p>
      <p style="margin:28px 0">
        <a href="${safeUrl}" style="background:#087f5b;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;font-weight:700">Reset password</a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#5f6b66">This single-use link expires in 1 hour. If you did not request it, you can ignore this email.</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

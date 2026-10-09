import { env } from "../config/env.js";

type VerificationEmail = {
  email: string;
  token: string;
  idempotencyKey: string;
};

export async function sendVerificationEmail(input: VerificationEmail) {
  if (!env.RESEND_API_KEY) return;

  const verificationUrl = new URL("/verify-email", env.PUBLIC_APP_URL);
  verificationUrl.searchParams.set("token", input.token);

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
      subject: "Verify your Rally account",
      text: `Verify your Rally account: ${verificationUrl.toString()}\n\nThis link expires in 24 hours.`,
      html: verificationEmailHtml(verificationUrl.toString())
    }),
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Verification email delivery failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

function verificationEmailHtml(verificationUrl: string) {
  const safeUrl = escapeHtml(verificationUrl);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f7f6;color:#17211d;font-family:Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px">
      <h1 style="font-size:28px;margin:0 0 12px">Rally</h1>
      <p style="font-size:17px;line-height:1.5">Verify your Illinois email to finish creating your account.</p>
      <p style="margin:28px 0">
        <a href="${safeUrl}" style="background:#087f5b;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;font-weight:700">Verify email</a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#5f6b66">This link expires in 24 hours. If you did not request a Rally account, you can ignore this email.</p>
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

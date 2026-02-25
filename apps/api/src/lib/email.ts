/**
 * Email delivery service for magic link authentication.
 *
 * Uses Resend in production and logs to console in development.
 */

import { logger } from "./logger.js";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@sindri.dev";

interface ResendResponse {
  id?: string;
  error?: { message: string };
}

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });

  const data = (await response.json()) as ResendResponse;
  if (!response.ok) {
    throw new Error(`Resend API error: ${data.error?.message ?? response.statusText}`);
  }

  logger.info({ to, emailId: data.id }, "Magic link email sent via Resend");
}

function buildMagicLinkHtml(url: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #1a1a2e;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 24px; font-weight: 700; margin: 0;">Mimir</h1>
    <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">Fleet Management Control Plane</p>
  </div>
  <div style="background: #f8f9fa; border-radius: 12px; padding: 32px; text-align: center;">
    <h2 style="font-size: 20px; margin: 0 0 12px;">Sign in to Mimir</h2>
    <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">Click the button below to securely sign in. This link expires in 15 minutes.</p>
    <a href="${url}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Sign in to Mimir</a>
    <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="color: #6b7280; font-size: 12px; word-break: break-all; margin: 8px 0 0;">${url}</p>
  </div>
  <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 24px 0 0;">If you didn't request this email, you can safely ignore it.</p>
</body>
</html>`.trim();
}

export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  const subject = "Sign in to Mimir";
  const html = buildMagicLinkHtml(url);

  if (process.env.NODE_ENV === "development" && !process.env.RESEND_API_KEY) {
    logger.info({ to, url }, "Magic link (dev mode — no email sent)");
    console.log(`\n  ✉️  Magic link for ${to}:\n  ${url}\n`);
    return;
  }

  await sendViaResend(to, subject, html);
}

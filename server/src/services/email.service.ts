import { Resend } from "resend";
import { env } from "../config/env";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailInput) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping email to ${to}: "${subject}"`);
    return;
  }

  const { error } = await resend.emails.send({
    from: env.emailFrom,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Failed to send email via Resend: ${error.message}`);
  }
}

export function sendVerificationEmail(to: string, verifyUrl: string) {
  return sendEmail({
    to,
    subject: "Verify your account",
    html: `
      <p>Welcome! Please confirm your email address to activate your account.</p>
      <p><a href="${verifyUrl}">Verify my email</a></p>
      <p>If you did not create this account, you can ignore this email.</p>
    `,
  });
}

export function sendPasswordResetEmail(to: string, resetUrl: string) {
  return sendEmail({
    to,
    subject: "Reset your password",
    html: `
      <p>We received a request to reset your password.</p>
      <p><a href="${resetUrl}">Reset my password</a></p>
      <p>This link will expire shortly. If you did not request this, you can ignore this email.</p>
    `,
  });
}

export function sendPasswordChangedEmail(to: string) {
  return sendEmail({
    to,
    subject: "Your password was changed",
    html: `<p>Your account password was just changed. If this wasn't you, please contact your administrator immediately.</p>`,
  });
}

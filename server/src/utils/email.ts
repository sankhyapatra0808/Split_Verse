import "dotenv/config";
import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

const smtpHost = (process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com").trim();
const smtpPort = Number(process.env.BREVO_SMTP_PORT || 587);
const smtpUser = process.env.BREVO_SMTP_USER?.trim();
const smtpKey = process.env.BREVO_SMTP_KEY?.trim();
const emailFrom = process.env.EMAIL_FROM?.trim();

export function isEmailConfigured() {
  return Boolean(smtpHost && smtpPort && smtpUser && smtpKey && emailFrom);
}

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: smtpUser,
    pass: smtpKey,
  },
});

export async function sendTransactionalEmail({
  to,
  subject,
  html,
  text,
}: SendEmailInput) {
  if (!isEmailConfigured()) {
    console.error("Brevo SMTP is not configured:", {
      hasHost: Boolean(smtpHost),
      smtpPort,
      hasUser: Boolean(smtpUser),
      hasKey: Boolean(smtpKey),
      hasEmailFrom: Boolean(emailFrom),
    });

    return {
      ok: false,
      reason: "not_configured" as const,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: emailFrom,
      to,
      subject,
      html,
      text,
    });

    return {
      ok: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Brevo SMTP email failed:", error);

    return {
      ok: false,
      reason: "failed" as const,
      error,
    };
  }
}

import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';

export interface SentEmailRecord {
  to: string;
  subject: string;
  text: string;
  html: string;
  resetToken: string;
  resetUrl: string;
}

export interface EmailService {
  sendPasswordResetEmail(email: string, resetToken: string, resetUrl: string): Promise<void>;
  getSentEmails(): SentEmailRecord[];
  clearSentEmails(): void;
}

class DefaultEmailService implements EmailService {
  private transporter: Transporter | null = null;
  private readonly sentEmails: SentEmailRecord[] = [];

  constructor() {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        secure: env.SMTP_SECURE,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }
  }

  async sendPasswordResetEmail(email: string, resetToken: string, resetUrl: string): Promise<void> {
    const link = `${resetUrl}?token=${encodeURIComponent(resetToken)}`;
    const subject = 'AUROZE Travel Marketplace — Password Reset Request';
    const text = `You requested a password reset for your AUROZE account.\n\nClick the link below to set a new password:\n${link}\n\nThis link is valid for 15 minutes. If you did not request this, please ignore this email.`;
    const html = `
      <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
        <h2>AUROZE Travel Marketplace</h2>
        <p>You requested a password reset for your account.</p>
        <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#0f172a;color:#fff;text-decoration:none;border-radius:4px;">Reset Password</a></p>
        <p>Or copy this URL into your browser: <br><code>${link}</code></p>
        <p><small>This link expires in 15 minutes. If you did not request this reset, you can safely ignore this email.</small></p>
      </div>
    `;

    // Track in memory for tests / local development inspection
    this.sentEmails.push({
      to: email,
      subject,
      text,
      html,
      resetToken,
      resetUrl: link,
    });

    if (this.transporter) {
      await this.transporter.sendMail({
        from: env.SMTP_FROM,
        to: email,
        subject,
        text,
        html,
      });
    }
  }

  getSentEmails(): SentEmailRecord[] {
    return [...this.sentEmails];
  }

  clearSentEmails(): void {
    this.sentEmails.length = 0;
  }
}

export const emailService: EmailService = new DefaultEmailService();

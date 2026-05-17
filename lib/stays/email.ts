import 'server-only';
import { Resend } from 'resend';

// Lazy init. When RESEND_API_KEY is unset (local dev / pre-launch),
// sendStayInvitation logs the link to the console + returns it so the host
// can copy/paste manually. Same fallback for completion emails.

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  if (cachedClient) return cachedClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cachedClient = new Resend(key);
  return cachedClient;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function from(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'HostReel <onboarding@example.com>';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inviteHtml(args: {
  guestName: string;
  hostFirstName: string | null;
  propertyName: string;
  hostNote?: string | null;
  link: string;
}): string {
  const greetingName = escapeHtml(args.guestName.split(' ')[0] ?? args.guestName);
  const property = escapeHtml(args.propertyName);
  const host = args.hostFirstName ? `${escapeHtml(args.hostFirstName)}, your host,` : 'Your host';
  const note = args.hostNote
    ? `<p style="margin:16px 0;padding:12px 16px;border-left:3px solid #C8A876;background:#FAF6EE;color:#5A554D;font-style:italic;">${escapeHtml(args.hostNote)}</p>`
    : '';
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FAF6EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#FAF6EE;">
    <tr><td style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #F0E9D8;border-radius:8px;">
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;color:#2A2723;">Hi ${greetingName},</h1>
          <p style="margin:0 0 16px 0;color:#5A554D;font-size:15px;line-height:1.6;">
            ${host} put together a quick walkthrough of <strong>${property}</strong> for your stay. Please review it before check-in — it covers the wifi, the trash schedule, and how everything works.
          </p>
          ${note}
          <p style="margin:24px 0;">
            <a href="${args.link}" style="display:inline-block;background:#C8A876;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:500;">Open walkthrough</a>
          </p>
          <p style="margin:16px 0 0 0;color:#5A554D;font-size:13px;line-height:1.5;">
            Or open this link: <br/>
            <a href="${args.link}" style="color:#A88B5C;word-break:break-all;">${args.link}</a>
          </p>
          <hr style="border:none;border-top:1px solid #F0E9D8;margin:24px 0;"/>
          <p style="margin:0;color:#5A554D;font-size:12px;line-height:1.5;">
            This link is personal to you and will expire. If you didn't expect this, you can ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function inviteText(args: {
  guestName: string;
  hostFirstName: string | null;
  propertyName: string;
  hostNote?: string | null;
  link: string;
}): string {
  const greetingName = args.guestName.split(' ')[0] ?? args.guestName;
  const host = args.hostFirstName
    ? `${args.hostFirstName}, your host,`
    : 'Your host';
  return [
    `Hi ${greetingName},`,
    '',
    `${host} put together a walkthrough of ${args.propertyName} for your stay. Please review it before check-in.`,
    args.hostNote ? `\nNote from your host:\n"${args.hostNote}"` : '',
    '',
    `Open the walkthrough: ${args.link}`,
    '',
    "This link is personal and will expire. If you didn't expect this, you can ignore it.",
  ]
    .filter(Boolean)
    .join('\n');
}

export async function sendStayInvitation(args: {
  toEmail: string;
  guestName: string;
  hostFirstName: string | null;
  propertyName: string;
  hostNote?: string | null;
  link: string;
}): Promise<{ delivered: boolean; previewLink?: string }> {
  const client = getClient();
  if (!client) {
    console.warn(
      `[stays] RESEND_API_KEY unset — invite link for ${args.toEmail}:\n  ${args.link}`,
    );
    return { delivered: false, previewLink: args.link };
  }
  try {
    await client.emails.send({
      from: from(),
      to: args.toEmail,
      subject: `Your walkthrough for ${args.propertyName}`,
      html: inviteHtml(args),
      text: inviteText(args),
    });
    return { delivered: true };
  } catch (err) {
    console.error('[stays] invite email failed', err);
    return { delivered: false, previewLink: args.link };
  }
}

export async function sendStayCompletion(args: {
  toEmail: string;
  ccHostEmail: string | null;
  guestName: string;
  propertyName: string;
  receiptLink: string;
}): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn(
      `[stays] RESEND_API_KEY unset — completion email for ${args.toEmail}, receipt at ${args.receiptLink}`,
    );
    return;
  }
  const greetingName = escapeHtml(args.guestName.split(' ')[0] ?? args.guestName);
  const property = escapeHtml(args.propertyName);
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FAF6EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#FAF6EE;">
    <tr><td style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #F0E9D8;border-radius:8px;">
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;color:#2A2723;">All set, ${greetingName}.</h1>
          <p style="margin:0 0 16px 0;color:#5A554D;font-size:15px;line-height:1.6;">
            Your check-in for <strong>${property}</strong> is complete. We've kept a record of everything you acknowledged — here's your copy.
          </p>
          <p style="margin:24px 0;">
            <a href="${args.receiptLink}" style="display:inline-block;background:#C8A876;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:500;">Download receipt (PDF)</a>
          </p>
          <p style="margin:0;color:#5A554D;font-size:12px;line-height:1.5;">
            Save this PDF — it's your record of the check-in walkthrough.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  try {
    await client.emails.send({
      from: from(),
      to: args.toEmail,
      cc: args.ccHostEmail ? [args.ccHostEmail] : undefined,
      subject: `Check-in complete — ${args.propertyName}`,
      html,
      text: `Hi ${args.guestName.split(' ')[0]},\n\nYour check-in for ${args.propertyName} is complete. Download your receipt: ${args.receiptLink}`,
    });
  } catch (err) {
    console.error('[stays] completion email failed', err);
  }
}

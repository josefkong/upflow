/**
 * HTML + plain-text email templates for Up Flow.
 *
 * Kept dependency-free (no react-email) — these are transactional mails
 * that are read in milliseconds; an inline HTML string is plenty and ships
 * without adding to the bundle. Each template returns a `{ subject, html,
 * text }` triple ready to hand to `sendEmail`.
 *
 * Visual style mirrors the app: dark glass card on a neutral background,
 * primary purple button, footer with sender + legal text.
 */

const BRAND = {
  name: "Up Flow",
  primary: "#7c3aed", // matches the in-app primary
  bg: "#0b0b10",
  card: "#15151c",
  text: "#e6e6f0",
  muted: "#8b8b9a",
  border: "#2a2a36",
};

function shell({
  preheader,
  bodyHtml,
}: {
  preheader: string;
  bodyHtml: string;
}): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${BRAND.name}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND.text};">
    <span style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <div style="display:inline-flex;align-items:center;gap:10px;">
                  <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:${BRAND.primary};text-align:center;line-height:32px;font-weight:800;color:#fff;">⚡</span>
                  <span style="font-size:18px;font-weight:700;color:${BRAND.text};">${BRAND.name}</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px;font-size:15px;line-height:1.55;color:${BRAND.text};">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <p style="max-width:520px;margin:16px auto 0;color:${BRAND.muted};font-size:12px;line-height:1.5;text-align:center;">
            You're receiving this transactional email from ${BRAND.name} because
            of an account action you or your team initiated. If this wasn't you,
            you can safely ignore it.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:${BRAND.primary};border-radius:10px;"><a href="${escapeAttr(href)}" style="display:inline-block;padding:12px 22px;color:#fff;text-decoration:none;font-weight:600;font-size:15px;">${escapeHtml(label)}</a></td></tr></table>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function commercialLeadPresentationEmail(opts: {
  recipientName: string;
  brandName: string;
  startsAtLabel: string;
  endsAtLabel: string;
  meetingUrl?: string | null;
}): RenderedEmail {
  const subject = `Apresentação agendada — ${opts.brandName}`;
  const meetingAction = opts.meetingUrl
    ? button(opts.meetingUrl, "Entrar no Google Meet")
    : `<p style="margin:16px 0 0;color:${BRAND.muted};font-size:13px;">O evento foi adicionado ao calendário. O link do Google Meet ficará disponível após a sincronização da agenda do responsável.</p>`;
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${BRAND.text};">Apresentação agendada</h1>
    <p style="margin:0 0 12px;color:${BRAND.text};">Olá, <strong>${escapeHtml(opts.recipientName)}</strong>.</p>
    <p style="margin:0 0 12px;color:${BRAND.text};">A apresentação da marca <strong>${escapeHtml(opts.brandName)}</strong> foi agendada.</p>
    <p style="margin:0;color:${BRAND.muted};">Início: ${escapeHtml(opts.startsAtLabel)}<br />Término: ${escapeHtml(opts.endsAtLabel)}</p>
    ${meetingAction}
  `;
  const text = [
    `Apresentação agendada — ${opts.brandName}`,
    `Olá, ${opts.recipientName}.`,
    `Início: ${opts.startsAtLabel}`,
    `Término: ${opts.endsAtLabel}`,
    opts.meetingUrl ? `Google Meet: ${opts.meetingUrl}` : "O link do Google Meet ficará disponível após a sincronização da agenda.",
  ].join("\n");
  return { subject, html: shell({ preheader: subject, bodyHtml: body }), text };
}

function workspaceRoleArticle(role: "admin" | "member" | "guest"): string {
  return role === "admin" ? "an admin" : `a ${role}`;
}

// --- Workspace invite -----------------------------------------------------

export function inviteEmail(opts: {
  workspaceName: string;
  inviterName: string;
  inviterEmail: string;
  acceptUrl: string;
  role: "admin" | "member" | "guest";
}): RenderedEmail {
  const subject = `You're invited to ${opts.workspaceName} on ${BRAND.name}`;
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${BRAND.text};">You've been invited to ${escapeHtml(opts.workspaceName)}</h1>
    <p style="margin:0 0 12px;color:${BRAND.text};">
      <strong>${escapeHtml(opts.inviterName)}</strong> (${escapeHtml(opts.inviterEmail)}) invited you to join
      <strong>${escapeHtml(opts.workspaceName)}</strong> as ${workspaceRoleArticle(opts.role)}.
    </p>
    <p style="margin:0 0 8px;color:${BRAND.muted};">Click below to accept and set up your account.</p>
    ${button(opts.acceptUrl, "Accept invite")}
    <p style="margin:24px 0 0;color:${BRAND.muted};font-size:13px;">
      If the button doesn't work, paste this link into your browser:<br />
      <a href="${escapeAttr(opts.acceptUrl)}" style="color:${BRAND.primary};word-break:break-all;">${escapeHtml(opts.acceptUrl)}</a>
    </p>
  `;
  const text = [
    `You've been invited to ${opts.workspaceName} on ${BRAND.name}`,
    ``,
    `${opts.inviterName} (${opts.inviterEmail}) invited you to join ${opts.workspaceName} as ${workspaceRoleArticle(opts.role)}.`,
    ``,
    `Accept the invite:`,
    opts.acceptUrl,
    ``,
    `If you weren't expecting this, you can safely ignore the message.`,
  ].join("\n");
  return {
    subject,
    html: shell({ preheader: `${opts.inviterName} invited you to ${opts.workspaceName}`, bodyHtml: body }),
    text,
  };
}

// --- Password reset -------------------------------------------------------

export function passwordResetEmail(opts: {
  resetUrl: string;
  recipientEmail: string;
}): RenderedEmail {
  const subject = `Reset your ${BRAND.name} password`;
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${BRAND.text};">Reset your password</h1>
    <p style="margin:0 0 12px;color:${BRAND.text};">
      We received a request to reset the password for
      <strong>${escapeHtml(opts.recipientEmail)}</strong>. Click the button
      below to choose a new one.
    </p>
    ${button(opts.resetUrl, "Set a new password")}
    <p style="margin:24px 0 0;color:${BRAND.muted};font-size:13px;">
      This link will expire in about an hour. If you didn't ask for a reset,
      you can ignore this email — your password won't change.
    </p>
    <p style="margin:16px 0 0;color:${BRAND.muted};font-size:13px;">
      Trouble with the button? Paste this link into your browser:<br />
      <a href="${escapeAttr(opts.resetUrl)}" style="color:${BRAND.primary};word-break:break-all;">${escapeHtml(opts.resetUrl)}</a>
    </p>
  `;
  const text = [
    `Reset your ${BRAND.name} password`,
    ``,
    `We received a request to reset the password for ${opts.recipientEmail}.`,
    `Open this link to choose a new password:`,
    opts.resetUrl,
    ``,
    `The link will expire in about an hour. If you didn't ask for a reset,`,
    `you can ignore this email.`,
  ].join("\n");
  return {
    subject,
    html: shell({ preheader: `Reset your ${BRAND.name} password`, bodyHtml: body }),
    text,
  };
}

// --- Invite accepted (admin notification) --------------------------------

export function inviteAcceptedEmail(opts: {
  workspaceName: string;
  newMemberEmail: string;
  newMemberName: string;
  role: "admin" | "member" | "guest";
  workspaceUrl: string;
}): RenderedEmail {
  const subject = `${opts.newMemberName} joined ${opts.workspaceName}`;
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${BRAND.text};">A new teammate joined ${escapeHtml(opts.workspaceName)}</h1>
    <p style="margin:0 0 12px;color:${BRAND.text};">
      <strong>${escapeHtml(opts.newMemberName)}</strong>
      (${escapeHtml(opts.newMemberEmail)}) accepted their invite and joined
      <strong>${escapeHtml(opts.workspaceName)}</strong> as ${workspaceRoleArticle(opts.role)}.
    </p>
    ${button(opts.workspaceUrl, "Open workspace")}
    <p style="margin:24px 0 0;color:${BRAND.muted};font-size:13px;">
      You're getting this because you're an admin of ${escapeHtml(opts.workspaceName)}.
    </p>
  `;
  const text = [
    `${opts.newMemberName} (${opts.newMemberEmail}) joined ${opts.workspaceName} as ${workspaceRoleArticle(opts.role)}.`,
    ``,
    `Open the workspace: ${opts.workspaceUrl}`,
  ].join("\n");
  return {
    subject,
    html: shell({ preheader: `${opts.newMemberName} joined ${opts.workspaceName}`, bodyHtml: body }),
    text,
  };
}

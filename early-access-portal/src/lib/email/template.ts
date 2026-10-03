/**
 * "Maligayang Pagdating sa Diskarte!" — the approval email.
 * Table-based, inline-styled HTML (Gmail, Outlook and Apple Mail friendly), dark navy + gold with
 * the salakot mascot, plus a plain-text alternative. Every interpolated value is HTML-escaped.
 */
export interface WelcomeEmailInput {
  name: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
  /** Absolute base for hosted images (the portal's public URL). */
  assetBaseUrl: string;
  /** The account existed already (e.g. signed up before early access): no new password. */
  existingAccount?: boolean;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "kabayan";
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";

export function welcomeEmail(input: WelcomeEmailInput): EmailMessage {
  const name = escapeHtml(firstName(input.name));
  const email = escapeHtml(input.email);
  const password = escapeHtml(input.tempPassword);
  const loginUrl = escapeHtml(input.loginUrl);
  const logo = escapeHtml(`${input.assetBaseUrl.replace(/\/$/, "")}/email/salakot.png`);
  const subject = "Maligayang Pagdating sa Diskarte! Pasok ka na sa Early Access";

  const credentials = input.existingAccount
    ? `<tr><td style="padding:0 32px 8px;font:15px/1.6 ${FONT};color:#cbd5e1;">
         May Diskarte account ka na gamit ang <strong style="color:#ffffff;">${email}</strong>, kaya gamitin mo lang ang dati mong password.
         Nakalimutan mo? I-click ang <em>Forgot password</em> sa login page.
       </td></tr>`
    : `<tr><td style="padding:0 32px;">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#020617;border:2px solid #FFB800;border-radius:12px;">
           <tr><td style="padding:18px 20px 6px;font:700 11px/1 ${MONO};letter-spacing:2px;color:#FFB800;">&#9654; PLAYER CREDENTIALS</td></tr>
           <tr><td style="padding:8px 20px 4px;font:13px/1.4 ${FONT};color:#94a3b8;">Email</td></tr>
           <tr><td style="padding:0 20px 10px;font:600 16px/1.4 ${MONO};color:#ffffff;word-break:break-all;">${email}</td></tr>
           <tr><td style="padding:4px 20px 4px;font:13px/1.4 ${FONT};color:#94a3b8;">Temporary password</td></tr>
           <tr><td style="padding:0 20px 18px;">
             <span style="display:inline-block;background:#0f172a;border:1px dashed #475569;border-radius:8px;padding:10px 14px;font:700 18px/1.2 ${MONO};letter-spacing:1px;color:#FFB800;">${password}</span>
           </td></tr>
         </table>
       </td></tr>
       <tr><td style="padding:14px 32px 0;font:14px/1.6 ${FONT};color:#fde68a;">
         &#9888;&#65039; <strong>Palitan agad ang password mo.</strong> Hihingan ka ng bagong password sa unang login mo — hindi ka makakapasok sa tambayan hangga't hindi mo ito napapalitan.
       </td></tr>`;

  const html = `<!doctype html>
<html lang="fil">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#020617;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Approved ka na sa Diskarte Early Access! Nasa loob ang login details mo.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#020617;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0f172a;border:1px solid #1e293b;border-radius:20px;overflow:hidden;">
      <tr><td style="height:6px;line-height:6px;font-size:0;background:#0038A8;">&nbsp;</td></tr>
      <tr><td align="center" style="padding:32px 32px 8px;">
        <img src="${logo}" width="88" height="88" alt="Diskarte salakot mascot" style="display:block;border:0;border-radius:20px;">
      </td></tr>
      <tr><td align="center" style="padding:8px 32px 0;font:700 11px/1 ${MONO};letter-spacing:3px;color:#FFB800;">&#9650; EARLY ACCESS UNLOCKED &#9650;</td></tr>
      <tr><td align="center" style="padding:14px 32px 6px;font:800 26px/1.25 ${FONT};color:#ffffff;">Maligayang Pagdating sa Diskarte!</td></tr>
      <tr><td style="padding:10px 32px 22px;font:15px/1.6 ${FONT};color:#cbd5e1;">
        Hi ${name}! Na-approve na ang application mo — kasama ka na sa unang batch ng mga tatambay sa <strong style="color:#ffffff;">Diskarte</strong>, ang bagong istambayan ng bayan.
      </td></tr>
      ${credentials}
      <tr><td align="center" style="padding:26px 32px 10px;">
        <a href="${loginUrl}" style="display:inline-block;background:#FFB800;color:#020617;text-decoration:none;font:800 16px/1 ${FONT};padding:16px 28px;border-radius:12px;box-shadow:0 4px 0 #b45309;">Mag-login sa Diskarte &rarr;</a>
      </td></tr>
      <tr><td align="center" style="padding:0 32px 24px;font:12px/1.6 ${FONT};color:#64748b;word-break:break-all;">
        o i-paste ito sa browser: <a href="${loginUrl}" style="color:#93c5fd;">${loginUrl}</a>
      </td></tr>
      <tr><td style="padding:0 32px 26px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:12px;">
          <tr><td style="padding:16px 18px;font:13px/1.7 ${FONT};color:#94a3b8;">
            <strong style="color:#e2e8f0;">Mga susunod na hakbang</strong><br>
            1. Mag-login gamit ang email at temporary password sa itaas.<br>
            2. Gumawa ng sariling password (10+ characters).<br>
            3. Piliin ang salakot avatar mo at gumawa o sumali sa isang Tambayan.
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px;font:12px/1.6 ${FONT};color:#64748b;">
        Paalala: hinding-hindi hihingin ng Diskarte team ang password mo. Hindi mo ba in-apply ito? Balewalain mo lang ang email na 'to.
      </td></tr>
      <tr><td style="height:6px;line-height:6px;font-size:0;background:#CE1126;">&nbsp;</td></tr>
    </table>
    <p style="margin:18px 0 0;font:11px/1.6 ${FONT};color:#475569;">Diskarte · Walang Shutdown-Shutdown: Ang Bagong Istambayan ng Bayan.</p>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    "MALIGAYANG PAGDATING SA DISKARTE!",
    "",
    `Hi ${firstName(input.name)}! Na-approve na ang Early Access application mo.`,
    "",
    ...(input.existingAccount
      ? [`May account ka na gamit ang ${input.email}. Mag-login gamit ang dati mong password.`]
      : [
          "Login details:",
          `  Email: ${input.email}`,
          `  Temporary password: ${input.tempPassword}`,
          "",
          "Hihingan ka ng bagong password sa unang login mo.",
        ]),
    "",
    `Mag-login: ${input.loginUrl}`,
    "",
    "Hinding-hindi hihingin ng Diskarte team ang password mo.",
  ].join("\n");

  return { to: input.email, subject, html, text };
}

import "server-only";
import { env } from "@/lib/env";

type Mail = { to: string; subject: string; text: string; html: string };

/** Sends transactional email through Resend. In development it logs instead. */
export async function sendMail(mail: Mail) {
  if (!env.RESEND_API_KEY) {
    console.info(`[mail:dev] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`Email send failed (${res.status})`);
}

const shell = (body: string) =>
  `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#141413">
     <div style="font-weight:700;font-size:18px;margin-bottom:24px">Ledger</div>${body}
     <p style="color:#6b6a63;font-size:12px;margin-top:32px">If you didn't ask for this, you can ignore this email.</p></div>`;

export const emails = {
  code: (code: string, purpose: "verify" | "sign-in" | "reset") => {
    const title = { verify: "Verify your email", "sign-in": "Your sign-in code", reset: "Reset your password" }[purpose];
    return {
      subject: `${code} is your Ledger code`,
      text: `${title}\n\nYour code: ${code}\nIt expires in 10 minutes.`,
      html: shell(`<h1 style="font-size:22px;margin:0 0 12px">${title}</h1>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px;background:#f4f4f2;border-radius:12px;text-align:center">${code}</div>
        <p style="color:#45443f">It expires in 10 minutes.</p>`),
    };
  },
  link: (url: string, purpose: "magic" | "reset") => {
    const title = purpose === "magic" ? "Sign in to Ledger" : "Reset your password";
    const cta = purpose === "magic" ? "Sign in" : "Choose a new password";
    return {
      subject: title,
      text: `${title}\n\n${url}\n\nThe link works once and expires in 30 minutes.`,
      html: shell(`<h1 style="font-size:22px;margin:0 0 16px">${title}</h1>
        <a href="${url}" style="display:inline-block;background:#e4e33a;color:#141413;font-weight:600;padding:12px 20px;border-radius:12px;text-decoration:none">${cta}</a>
        <p style="color:#45443f">The link works once and expires in 30 minutes.</p>`),
    };
  },
};

/** Pluggable mailer. Disabled (no-op) until a sender is configured:
 *  MAIL_PROVIDER=resend + RESEND_API_KEY + MAIL_FROM ("Golflet <hola@tu-dominio>"). Nothing is sent otherwise.
 *  Profesor sign-up / claim / verification stay gated while mailerConfigured() is false. */
export type Mail = { to: string; subject: string; text: string; html?: string };
export interface Mailer { readonly name: string; send(m: Mail): Promise<{ sent: boolean; id?: string; reason?: string }> }

const noop: Mailer = { name: "disabled", async send() { return { sent: false, reason: "No hay un servicio de email configurado" }; } };
const resend = (key: string, from: string): Mailer => ({
  name: "resend",
  async send(m) {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }) });
    const j: any = await r.json().catch(() => ({}));
    return r.ok ? { sent: true, id: j.id } : { sent: false, reason: j?.message || `HTTP ${r.status}` };
  },
});
export function mailerConfigured() {
  return process.env.MAIL_PROVIDER === "resend" && !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
}
export function getMailer(): Mailer {
  return mailerConfigured() ? resend(process.env.RESEND_API_KEY!, process.env.MAIL_FROM!) : noop;
}

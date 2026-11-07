import { mailerConfigured } from "@/lib/mailer";
/** Public client config (no secrets). Store links come from env and are only returned when set and valid. */
const ok = (v: string | undefined, host: RegExp) => { try { const u = new URL(String(v || "")); return u.protocol === "https:" && host.test(u.host) ? u.toString() : null; } catch { return null; } };
export async function GET() {
  return Response.json({
    ios_app_store_url: ok(process.env.IOS_APP_STORE_URL, /^(apps|itunes)\.apple\.com$/),
    android_play_store_url: ok(process.env.ANDROID_PLAY_STORE_URL, /^play\.google\.com$/),
    profesor_accounts_enabled: mailerConfigured(),   // false until an email sender is configured (sign-up / claim gated)
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}

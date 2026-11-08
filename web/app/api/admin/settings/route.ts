import { handle, json } from "@/lib/http";
import { adminBody, audit, requireAdmin } from "@/lib/admin";
import { settings } from "@/lib/admin-content";
import { dailyEnabled, setDailyEnabled } from "@/lib/gps-daily";

/** GET: feature flags and fixed platform settings (secrets are never listed) + editable switches. */
export const GET = handle(async (req: Request) => { await requireAdmin(req); return json({ ...settings(), switches: { gps_daily_read: await dailyEnabled() } }); });
/** PUT { gps_daily_read: bool } → global switch for the daily 06:00 greens read. */
export const PUT = handle(async (req: Request) => {
  const u = await requireAdmin(req); const b = await adminBody(req);
  if (typeof b.gps_daily_read === "boolean") { await setDailyEnabled(b.gps_daily_read, u.id); await audit(u, "settings.gps_daily_read", { type: "setting", id: "gps_daily_read" }, `Lectura diaria de greens 6:00 ${b.gps_daily_read ? "activada" : "desactivada"} (global)`); }
  return json({ switches: { gps_daily_read: await dailyEnabled() } });
});

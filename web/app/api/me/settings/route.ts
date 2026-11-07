import { handle, json, requireUser, HttpError } from "@/lib/http";
import { parseSettingsPatch } from "@/lib/a11y-core";
import { getSettings, setSettings } from "@/lib/settings";
/** GET → { pace_alert, text_size, text_weight, text_scale, text_scale_big }. PATCH any subset of { pace_alert: bool, text_size: normal|grande|muy_grande, text_weight: normal|marcado }. API_v5 §50, §52. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json(await getSettings(u.id)); });
export const PATCH = handle(async (req: Request) => {
  const u = await requireUser(req); let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  const p = parseSettingsPatch(b); if (!p.ok) throw new HttpError(400, p.error);
  return json(await setSettings(u.id, p.patch));
});

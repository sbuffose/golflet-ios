import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { ownLive } from "@/lib/live";
import { validLatLng } from "@/lib/geo";
import { liveHoles } from "@/lib/game-metrics";

type Ctx = { params: Promise<{ id: string; hole: string }> };
/** PUT { putts?: 0-10|null, pin?: { lat, lng, accuracy_m? } | null } — only the keys sent change. pin is the player's own GPS fix ("Estoy en la bandera"). */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req); const { id, hole: hs } = await ctx.params; const l = await ownLive(user.id, id);
  const hole = Number(hs); if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
  const b = await body<any>(req);
  const setP = "putts" in b, setPin = "pin" in b; if (!setP && !setPin) throw new HttpError(400, "Mandá putts o pin");
  const putts = b.putts == null ? null : Number(b.putts);
  if (putts != null && (!Number.isInteger(putts) || putts < 0 || putts > 10)) throw new HttpError(400, "Putts: 0 a 10");
  let pin: { lat: number; lng: number } | null = null, acc: number | null = null;
  if (setPin && b.pin != null) { pin = validLatLng(b.pin.lat, b.pin.lng); if (!pin) throw new HttpError(400, "Posición inválida");
    acc = b.pin.accuracy_m == null ? null : Number(b.pin.accuracy_m); if (acc != null && (!Number.isFinite(acc) || acc < 0 || acc > 5000)) throw new HttpError(400, "Precisión inválida"); }
  await q(`insert into live_hole (live_round_id, hole, putts, pin_lat, pin_lng, pin_accuracy_m, pin_at) values ($1,$2,$3,$4,$5,$6, case when $4::float8 is null then null else now() end)
    on conflict (live_round_id, hole) do update set
      putts = case when $7::boolean then excluded.putts else live_hole.putts end,
      pin_lat = case when $8::boolean then excluded.pin_lat else live_hole.pin_lat end,
      pin_lng = case when $8::boolean then excluded.pin_lng else live_hole.pin_lng end,
      pin_accuracy_m = case when $8::boolean then excluded.pin_accuracy_m else live_hole.pin_accuracy_m end,
      pin_at = case when $8::boolean then excluded.pin_at else live_hole.pin_at end, updated_at = now()`,
    [id, hole, setP ? putts : null, setPin ? pin?.lat ?? null : null, setPin ? pin?.lng ?? null : null, setPin ? acc : null, setP, setPin]);
  return json({ hole: (await liveHoles(l, user.id))[hole - 1] });
});

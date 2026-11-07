import { handle, json, requireUser, HttpError } from "@/lib/http";
import { lookupMatriculas } from "@/lib/groups";
/** POST { matriculas: ["123456", …] } (≤ 12, session) → { results: [{ matricula, status: user|unknown|self|invalid, name }] }. Only the display name. 120 per hour. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req); let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json({ results: await lookupMatriculas(u.id, b?.matriculas) });
});

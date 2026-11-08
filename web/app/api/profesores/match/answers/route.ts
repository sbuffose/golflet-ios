import { handle, json, requireUser, HttpError } from "@/lib/http";
import { getAnswers, saveAnswers } from "@/lib/profesor-match";
/** GET → { answers | null, suggested_hcp (official index), locations (declared by profesores) }. PUT partial answers → { answers }. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json(await getAnswers(u.id)); });
export const PUT = handle(async (req: Request) => {
  const u = await requireUser(req); let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json({ answers: await saveAnswers(u.id, b) });
});

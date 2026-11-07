import { handle, json, requireUser, HttpError } from "@/lib/http";
import { myProfesores, linkProfesor } from "@/lib/profesores";
/** GET → { profesores } (mine, with permissions). POST { profesor_id } → link (both permissions OFF). API_v5 §26. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json({ profesores: await myProfesores(u.id) }); });
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req); let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json({ profesor: await linkProfesor(u.id, b?.profesor_id, b?.source === "match" ? "match" : "search") }, 201);
});

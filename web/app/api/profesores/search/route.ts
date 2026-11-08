import { handle, json, requireUser } from "@/lib/http";
import { searchProfesores } from "@/lib/profesores";
/** GET ?q=<name or matrícula> → { profesores } (active profiles only; ≥ 2 chars). */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json({ profesores: await searchProfesores(u.id, new URL(req.url).searchParams.get("q") || "") }); });

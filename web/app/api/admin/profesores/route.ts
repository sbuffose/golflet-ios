import { handle, json, HttpError } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { listProfesoresAdmin, createPendingProfesor } from "@/lib/profesor-admin";
/** Admin: GET → { profesores }. POST { display_name, verified? } → pending profesor with name only (no email, no password). */
export const GET = handle(async (req: Request) => { await requireAdmin(req); return json({ profesores: await listProfesoresAdmin() }); });
export const POST = handle(async (req: Request) => {
  const u = await requireAdmin(req); let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  const id = await createPendingProfesor({ display_name: b?.display_name, verified: b?.verified === true, created_via: "admin", by: u.email || u.id });
  await audit(u as any, "profesor.create", { type: "profesor", id }, `Creó el profesor ${String(b?.display_name).slice(0, 80)}${b?.verified === true ? " (verificado)" : ""}`);
  return json({ profesor_id: id }, 201);
});

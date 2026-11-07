import { handle, json, requireUser } from "@/lib/http";
import { myStudents } from "@/lib/profesor-space";
/** Active profesor → { alumnos }: ONLY players who turned on "Puede ver mis métricas". */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json({ alumnos: await myStudents(u.id) }); });

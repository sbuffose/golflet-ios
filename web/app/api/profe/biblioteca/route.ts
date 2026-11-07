import { handle, json, requireUser } from "@/lib/http";
import { myLibrary } from "@/lib/profesor-sessions";
/** Profesor's own library: links/tips already assigned (deduped), to reuse with another student. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json({ items: await myLibrary(u.id) }); });

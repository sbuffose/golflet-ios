import { handle, json, requireUser } from "@/lib/http";
import { teeDirectory } from "@/lib/tee-times";

/** Course picker: every club in the Argentine directory with its courses (multi-course clubs); the player's clubs first. */
export const GET = handle(async (req: Request) => { const user = await requireUser(req); return json({ clubs: await teeDirectory(user.id) }); });

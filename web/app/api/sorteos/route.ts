import { handle, json, requireUser } from "@/lib/http";
import { listForPlayer } from "@/lib/sorteos";
/** Player: open/closed sorteos + the ones they entered or won (drawn ones stay 30 days). */
export const GET = handle(async (req: Request) => json(await listForPlayer((await requireUser(req)).id)));

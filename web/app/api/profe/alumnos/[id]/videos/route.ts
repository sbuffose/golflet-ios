import { handle, requireUser } from "@/lib/http";
import { uploadGate } from "@/lib/profesor-sessions";
/** Own-video upload for a student. Gated: student Premium (402) → private storage configured (503). Billing is off, so not available yet. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const u = await requireUser(req); const { id } = await ctx.params; return uploadGate(u.id, id); });

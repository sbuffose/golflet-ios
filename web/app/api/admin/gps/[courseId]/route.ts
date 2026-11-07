import { handle, json } from "@/lib/http";
import { requireEditor } from "@/lib/admin";
import { gpsCourse } from "@/lib/admin-content";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ courseId: string }> }) => { await requireEditor(req); const { courseId } = await ctx.params; return json(await gpsCourse(courseId)); });

import { handle, json } from "@/lib/http";
import { requireEditor } from "@/lib/admin";
import { listCourseCards } from "@/lib/admin-content";

export const GET = handle(async (req: Request) => { await requireEditor(req); return json({ courses: await listCourseCards() }); });

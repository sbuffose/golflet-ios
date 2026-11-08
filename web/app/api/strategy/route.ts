import { handle, json } from "@/lib/http";
import { publishedCourses, publishedStrategy } from "@/lib/strategy";

/** Public, published content only. ?course_id=118-jockey-azul | ?course_key=1:Azul -> course strategy; no params -> courses with content. */
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url); const id = u.searchParams.get("course_id"), key = u.searchParams.get("course_key");
  if (id || key) return json(await publishedStrategy({ course_id: id, course_key: key }));
  return json({ courses: await publishedCourses() });
});

import { handle, json } from "@/lib/http";
import { requireEditor } from "@/lib/admin";
import { listArClubs } from "@/lib/ar-clubs";

const b = (v: string | null) => (v === "1" ? true : v === "0" ? false : undefined);
/** Lista completa (admins y editores). Filtros opcionales: q, prov, fed, logo, course, linked, precise, src, has, missing. */
export const GET = handle(async (req: Request) => {
  await requireEditor(req); const u = new URL(req.url).searchParams;
  return json({ clubs: await listArClubs({ q: u.get("q") || undefined, prov: u.get("prov") || undefined, fed: u.get("fed") || undefined, logo: b(u.get("logo")), course: b(u.get("course")),
    linked: b(u.get("linked")), precise: b(u.get("precise")), src: u.get("src") || undefined, has: u.get("has") || undefined, missing: u.get("missing") || undefined }) });
});

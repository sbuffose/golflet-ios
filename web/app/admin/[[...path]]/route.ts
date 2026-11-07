import { panelRole } from "@/lib/admin";
import { getAdminSession } from "@/lib/admin-auth";
import { ADMIN_HTML, ADMIN_LOGIN_HTML } from "@/lib/admin-assets";

const H = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" };
const html = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...H } });

/**
 * /admin/** — needs its own admin session (usuario + contraseña at /admin/login, 8h) AND an admin/editor role.
 * The player session alone does not open the panel. Every admin API checks both again.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const s = await getAdminSession(req).catch(() => null);
  const ok = s ? !!(await panelRole(s.user_id)) : false;
  if (url.pathname === "/admin/login" || url.pathname === "/admin/login/") {
    if (ok) return Response.redirect(new URL("/admin", req.url), 302);
    return html(ADMIN_LOGIN_HTML);
  }
  if (!ok) {
    const next = url.pathname + url.search;
    return Response.redirect(new URL(`/admin/login?next=${encodeURIComponent(next)}`, req.url), 302);
  }
  return html(ADMIN_HTML);
}

import { auth } from "./auth";

export type SessionUser = { id: string; email: string; name: string };

import { HttpError } from "./http-error";
export { HttpError };

/** Resolves the signed-in user from the session cookie or `Authorization: Bearer`. */
export async function requireUser(req: Request): Promise<SessionUser> {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s?.user) throw new HttpError(401, "No autenticado");
  return { id: s.user.id, email: s.user.email, name: s.user.name };
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Wrap a handler: auth errors -> 401, HttpError -> status, anything else -> 500 (no internals leaked). */
export function handle<A extends unknown[]>(fn: (req: Request, ...a: A) => Promise<Response>) {
  return async (req: Request, ...a: A) => {
    try { return await fn(req, ...a); }
    catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error("api error", e instanceof Error ? e.message : "unknown");
      return json({ error: "Error interno" }, 500);
    }
  };
}

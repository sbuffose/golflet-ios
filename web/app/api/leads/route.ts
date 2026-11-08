import { handle, json, HttpError } from "@/lib/http";
import { auth } from "@/lib/auth";
import { createLead } from "@/lib/leads";
/** Public (signed in or not): POST { kind: profesor|marca|contacto, nombre, telefono, lugar?, matricula_aag?, empresa?, motivo? } → 201. 5 per day per IP/user. */
export const POST = handle(async (req: Request) => {
  let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  const s = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  return json(await createLead(req, b, s?.user?.id ?? null), 201);
});

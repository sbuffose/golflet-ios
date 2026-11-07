import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { ownAccount } from "@/lib/accounts";
import { listAccounts } from "@/lib/data";
import { encryptSecret } from "@/lib/crypto";
import { syncAccount, syncAppLink } from "@/lib/sync";
import { progressWriter } from "@/lib/progress";
import { logSync } from "@/lib/sync-log";

export const maxDuration = 300;

/** "Actualizar". Optional body { password, save_password } when no password is stored. App accounts sync all their clubs. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  const acc = await ownAccount(user.id, id);
  if (acc.last_sync_at && Date.now() - +new Date(acc.last_sync_at) < 60_000) throw new HttpError(429, "Recién se actualizó; probá en un minuto");
  let b: any = {}; try { b = await req.json(); } catch {}
  const password = typeof b.password === "string" && b.password ? b.password : undefined;
  if (!password && !acc.password_enc) throw new HttpError(409, "Ingresá tu contraseña para actualizar");
  const [club] = await q(`select name from club where id=$1`, [acc.club_id]);
  const prog = progressWriter(user.id, b.progress_id, acc.source === "app" ? "tus clubes" : club?.name || "tu club");
  await prog.start(); const t0 = Date.now();
  // App-source accounts refresh the whole link (every club of the matrícula) in one go
  const r = await (acc.source === "app"
    ? syncAppLink(user.id, acc.matricula, { password, savePassword: password && b.save_password ? true : undefined, onProgress: prog.on })
    : syncAccount(id, password, 240_000, prog.on)).catch(async e => { await prog.finish("error"); await logSync(user.id, "manual", null, t0, "Error interno"); throw e; });
  await prog.finish(r.ok ? undefined : r.message);
  await logSync(user.id, "manual", r, t0);
  if (acc.source !== "app" && r.ok && password && b.save_password) await q(`update club_account set password_enc=$2 where id=$1`, [id, encryptSecret(password)]);
  return json({ sync: r, accounts: await listAccounts(user.id) }, r.ok ? 200 : 502);
});

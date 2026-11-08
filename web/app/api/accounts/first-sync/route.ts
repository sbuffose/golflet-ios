import { handle, json, requireUser, HttpError } from "@/lib/http";
import { body } from "@/lib/accounts";
import { listAccounts } from "@/lib/data";
import { q } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { GolfisticsError } from "@/lib/golfistics";
import { syncAppLink, directClubs, NO_APP_CLUBS } from "@/lib/sync";
import { logSync } from "@/lib/sync-log";
import { progressWriter } from "@/lib/progress";

export const maxDuration = 300;

/** Is a first sync waiting after a Golfistics sign-in? { pending, matricula } */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const [p] = await q(`select matricula from golfistics_pending where user_id=$1 and created_at > now() - interval '1 day'`, [user.id]);
  return json({ pending: !!p, matricula: p?.matricula ?? null });
});

/**
 * First sync after the first Golfistics sign-in: { progress_id? }. Uses the clave kept encrypted by POST /api/auth/golfistics,
 * links every club of the matrícula (same as POST /api/accounts) and then forgets the pending copy. Same response as POST /api/accounts.
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const b = await body<{ progress_id?: string }>(req);
  await q(`delete from golfistics_pending where created_at < now() - interval '1 day'`);
  const [p] = await q(`select matricula, password_enc, save_password from golfistics_pending where user_id=$1`, [user.id]);
  if (!p) throw new HttpError(404, "No hay una sincronización pendiente");
  let password: string;
  try { password = decryptSecret(p.password_enc); } catch { await q(`delete from golfistics_pending where user_id=$1`, [user.id]); throw new HttpError(409, "Volvé a entrar con tu matrícula y contraseña"); }
  const prog = progressWriter(user.id, b.progress_id, "tus clubes");
  await prog.start(); const t0 = Date.now();
  const sync = await syncAppLink(user.id, p.matricula, { password, savePassword: !!p.save_password, onProgress: prog.on })
    .catch(async e => {
      await prog.finish("error");
      await q(`delete from golfistics_pending where user_id=$1`, [user.id]);
      await logSync(user.id, "link", null, t0, e instanceof GolfisticsError ? (e.code === "login_failed" ? "El club rechazó la matrícula o la clave" : "No se pudo conectar con el sistema de tu club") : "Error interno");
      if (e instanceof GolfisticsError) throw new HttpError(e.code === "login_failed" ? 422 : 502, e.code === "login_failed" ? "No pudimos entrar con esa matrícula y contraseña" : e.message);
      throw e;
    });
  await prog.finish(sync.ok ? undefined : sync.message);
  await logSync(user.id, "link", sync, t0);
  // one attempt only (no retry loop on every page load); if it failed the player links from Cuenta → Vincular Golfistics
  await q(`delete from golfistics_pending where user_id=$1`, [user.id]);
  // t166u: the App lists no clubs for this matrícula (San Isidro members): the player picks the club in Vincular
  if (!sync.account_ids.length && sync.message === NO_APP_CLUBS) return json({ error: NO_APP_CLUBS, code: "NEEDS_CLUB", matricula: p.matricula, clubs: await directClubs() }, 422);
  if (!sync.account_ids.length) throw new HttpError(502, sync.message);
  return json({ account_id: sync.account_ids[0], account_ids: sync.account_ids, sync, accounts: await listAccounts(user.id) }, 201);
});

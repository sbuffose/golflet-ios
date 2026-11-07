import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { listAccounts } from "@/lib/data";
import { GolfisticsError } from "@/lib/golfistics";
import { syncAppLink, linkSiteAccount, directClubs, NO_APP_CLUBS } from "@/lib/sync";
import { logSync } from "@/lib/sync-log";
import { GolfisticsApp } from "@/lib/golfistics-app";
import { progressWriter } from "@/lib/progress";

export const maxDuration = 300;

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  return json({ accounts: await listAccounts(user.id) });
});

/**
 * Link Golfistics: { matricula, password, save_password, progress_id?, club_id? }.
 * - Without club_id: Golfistics App (one login for every club of the matrícula).
 * - t166u: if the App rejects the clave or lists no clubs (San Isidro members), answer 422 { code: "NEEDS_CLUB", clubs }
 *   so the player picks the club; nothing is stored.
 * - With club_id (a `direct_login` club): the club's own site login, read-only, same pages as the App SSO.
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const b = await body<{ matricula?: string; password?: string; save_password?: boolean; progress_id?: string; club_id?: number | string }>(req);
  const matricula = String(b.matricula ?? "").trim();
  const password = String(b.password ?? "");
  if (!/^[\w.-]{1,32}$/.test(matricula)) throw new HttpError(400, "Matrícula inválida");
  if (!password || password.length > 128) throw new HttpError(400, "Falta la contraseña");

  const clubId = b.club_id == null || b.club_id === "" ? null : Number(b.club_id);
  if (clubId != null && !Number.isInteger(clubId)) throw new HttpError(400, "Club inválido");

  if (clubId != null) {   // t166u: club-site route
    const [c] = await q(`select name from club where id=$1 and direct_login`, [clubId]);
    if (!c) throw new HttpError(400, "Ese club no se puede vincular directo");
    const prog = progressWriter(user.id, b.progress_id, c.name);
    await prog.start(); const t0 = Date.now();
    let sync;
    try { sync = await linkSiteAccount(user.id, clubId, matricula, password, !!b.save_password, 240_000, prog.on); }
    catch (e) {
      await prog.finish(e instanceof GolfisticsError ? e.message : "error");
      await logSync(user.id, "link", null, t0, e instanceof GolfisticsError ? (e.code === "login_failed" ? `${c.name}: el club rechazó la matrícula o la clave` : `${c.name}: no se pudo conectar con el club`) : "Error interno");
      if (e instanceof GolfisticsError) throw new HttpError(e.code === "login_failed" ? 422 : 502, e.code === "login_failed" ? `${c.name} no aceptó esa matrícula y contraseña. Usá la clave con la que entrás al sitio del club.` : e.message);
      throw e;
    }
    await prog.finish(sync.ok ? undefined : sync.message);
    await logSync(user.id, "link", sync, t0);
    if (!sync.ok) throw new HttpError(502, sync.message);
    return json({ account_id: sync.account_ids[0], account_ids: sync.account_ids, sync, accounts: await listAccounts(user.id) }, 201);
  }

  const needsClub = async (error: string) => json({ error, code: "NEEDS_CLUB", clubs: await directClubs() }, 422);
  const prog = progressWriter(user.id, b.progress_id, "tus clubes");
  await prog.start(); const t0 = Date.now();
  // verify the credential live before anything is stored or claimed
  let app: GolfisticsApp;
  try { app = await new GolfisticsApp(matricula, password).login(); await app.listClubs(); }
  catch (e) {
    await prog.finish(e instanceof GolfisticsError ? e.message : "error");
    await logSync(user.id, "link", null, t0, e instanceof GolfisticsError && e.code === "login_failed" ? "El club rechazó la matrícula o la clave" : "No se pudo conectar con el sistema de tu club");
    if (e instanceof GolfisticsError && e.code === "login_failed") return needsClub("No se aceptó esa matrícula y contraseña. Si tu club tiene su propio sitio (por ejemplo San Isidro), elegilo y usá la clave del sitio del club.");
    if (e instanceof GolfisticsError) throw new HttpError(502, e.message);
    throw e;
  }
  if (!app.clubs.length) {
    await prog.finish(NO_APP_CLUBS);
    await logSync(user.id, "link", null, t0, "No aparecen clubes para esta matrícula");
    return needsClub(NO_APP_CLUBS);
  }
  const sync = await syncAppLink(user.id, matricula, { password, savePassword: !!b.save_password, app, onProgress: prog.on })
    .catch(async e => { await prog.finish("error"); await logSync(user.id, "link", null, t0, "Error interno"); throw e; });
  await prog.finish(sync.ok ? undefined : sync.message);
  await logSync(user.id, "link", sync, t0);
  if (!sync.account_ids.length) throw new HttpError(502, sync.message);
  return json({ account_id: sync.account_ids[0], account_ids: sync.account_ids, sync, accounts: await listAccounts(user.id) }, 201);
});

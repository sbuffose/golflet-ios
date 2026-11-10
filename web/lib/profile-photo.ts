/** Player photo. The column is migration 0045, which is prepared and not applied.
 *  A missing column is not a 500 on the home payload: the avatar stays initials. */
import { q } from "./db";
import { HttpError } from "./http-error";
import { processPhoto } from "./group-share";

export function missingPhotoColumn(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === "42703" || /column ["']?photo/i.test(String(e?.message || ""));
}

export const PHOTO_UNAVAILABLE = "La foto de perfil necesita la migración 0045, que todavía no está aplicada. No se guardó nada.";
export type PhotoState = "unavailable" | "empty" | "ready";

/** A read. unavailable means the column is not there yet. It does not create the column. */
export async function profilePhotoStatus(userId: string): Promise<{ state: PhotoState; photo_url: string | null }> {
  try {
    const [r] = await q(`select (photo is not null) as has_photo, photo_updated_at from user_pref where user_id=$1`, [userId]);
    if (!r?.has_photo) return { state: "empty", photo_url: null };
    const v = r.photo_updated_at ? new Date(r.photo_updated_at).getTime() : 0;
    return { state: "ready", photo_url: `/api/me/photo?v=${v}` };
  } catch (e) {
    if (missingPhotoColumn(e)) return { state: "unavailable", photo_url: null };
    throw e;
  }
}

export async function profilePhotoUrl(userId: string): Promise<string | null> {
  return (await profilePhotoStatus(userId)).photo_url;
}

/** Users who actually have a stored photo. A missing column returns an empty map. */
export async function profilePhotos(userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return new Set();
  try {
    const rows = await q(`select user_id from user_pref where user_id = any($1::uuid[]) and photo is not null`, [ids]);
    return new Set(rows.map((r: { user_id: string }) => r.user_id));
  } catch (e) {
    if (missingPhotoColumn(e)) return new Set();
    throw e;
  }
}

export async function readProfilePhoto(userId: string): Promise<Buffer | null> {
  try {
    const [r] = await q(`select photo from user_pref where user_id=$1`, [userId]);
    if (!r?.photo) return null;
    return Buffer.isBuffer(r.photo) ? r.photo : Buffer.from(r.photo);
  } catch (e) {
    if (missingPhotoColumn(e)) return null;
    throw e;
  }
}

export async function setProfilePhoto(userId: string, buf: Buffer | null) {
  const photo = buf ? await processPhoto(buf) : null;
  try {
    await q(`insert into user_pref (user_id, photo, photo_updated_at, updated_at) values ($1,$2,case when $2::bytea is null then null else now() end,now())
      on conflict (user_id) do update set photo=excluded.photo, photo_updated_at=case when excluded.photo is null then null else now() end, updated_at=now()`, [userId, photo]);
  } catch (e) {
    if (missingPhotoColumn(e)) throw new HttpError(503, PHOTO_UNAVAILABLE);
    throw e;
  }
  return { ok: true, photo_url: photo ? await profilePhotoUrl(userId) : null };
}

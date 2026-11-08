import { q } from "./db";
import { TEXT_SIZES, type TextSize, type TextWeight } from "./a11y-core";
export type Settings = { pace_alert: boolean; text_size: TextSize; text_weight: TextWeight; text_scale: number; text_scale_big: number };
export async function getSettings(userId: string): Promise<Settings> {
  const [r] = await q(`select pace_alert, text_size, text_weight from user_pref where user_id=$1`, [userId]);
  const size = (r?.text_size || "normal") as TextSize, w = (r?.text_weight || "normal") as TextWeight;
  return { pace_alert: r ? !!r.pace_alert : true, text_size: size, text_weight: w, text_scale: TEXT_SIZES[size].scale, text_scale_big: TEXT_SIZES[size].big };
}
export async function setSettings(userId: string, p: { pace_alert?: boolean; text_size?: TextSize; text_weight?: TextWeight }) {
  await q(`insert into user_pref (user_id, pace_alert, text_size, text_weight, updated_at) values ($1, coalesce($2::boolean, true), coalesce($3,'normal'), coalesce($4,'normal'), now())
           on conflict (user_id) do update set pace_alert=coalesce($2::boolean, user_pref.pace_alert), text_size=coalesce($3, user_pref.text_size), text_weight=coalesce($4, user_pref.text_weight), updated_at=now()`,
    [userId, p.pace_alert ?? null, p.text_size ?? null, p.text_weight ?? null]);
  return getSettings(userId);
}

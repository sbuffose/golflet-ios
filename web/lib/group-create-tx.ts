import { HttpError } from "./http-error";
import { withTransaction, type QueryClient } from "./db";
import { groupCreatePayloadHash, normalizeIdempotencyKey, presentCreatedGroup } from "./group-create";
import { linkInfo, newToken } from "./group-share";

const SCHEMA_MISSING = "No se pudo crear el grupo. Falta el registro de reintento en la base, así que no lo creé.";
const photoOf = (g: { id: string; has_photo?: boolean; photo_updated_at?: string | null }) =>
  g.has_photo ? `/api/groups/${g.id}/photo?v=${g.photo_updated_at ? new Date(g.photo_updated_at).getTime() : 0}` : null;

class LostCreateRace extends Error {
  constructor(public row: any, public invited: any[]) { super("lost create race"); }
}

async function loadReplay(run: (text: string, params?: unknown[]) => Promise<any[]>, userId: string, key: string) {
  let row: any;
  try {
    [row] = await run(`select g.id, g.name, g.share_token, g.share_enabled, g.share_expires_at, g.photo_updated_at, (g.photo is not null) has_photo, k.payload_hash
      from cmp_create_key k join cmp_group g on g.id = k.group_id where k.user_id=$1 and k.idem_key=$2`, [userId, key]);
  } catch (e) {
    if ((e as { code?: string })?.code === "42P01") throw new HttpError(503, SCHEMA_MISSING);
    throw e;
  }
  if (!row) return null;
  const invited = await run(`select id member_id, matricula, (user_id is not null) is_user from cmp_member where group_id=$1 and status='invited'`, [row.id]);
  return { row, invited };
}

/**
 * Inserts the group, its owner and the idempotency row in one transaction.
 * The same user+key replays that group. A different payload with the same key is rejected.
 * A different key with the same name is a new group. If cmp_create_key is missing, the transaction
 * rolls back and nothing is left behind.
 */
export async function createGroupAtomic(userId: string, name: unknown, matriculas: unknown, idemRaw?: unknown, connect?: () => Promise<QueryClient>, perDay = 10) {
  const nm = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (nm.length < 2 || nm.length > 40) throw new HttpError(400, "Poné un nombre de 2 a 40 letras.");
  const key = normalizeIdempotencyKey(idemRaw);
  const payload = groupCreatePayloadHash(nm, matriculas);
  try {
    const created = await withTransaction(async (run) => {
      if (key) {
        await run(`select pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [userId, key]);
        const prev = await loadReplay(run, userId, key);
        if (prev) {
          if (prev.row.payload_hash && prev.row.payload_hash !== payload) throw new HttpError(409, "Esa clave ya se usó para otro grupo.");
          return { replay: true as const, result: presentCreatedGroup(prev.row, prev.invited, linkInfo(prev.row), photoOf(prev.row)) };
        }
      }
      const [n] = await run(`select count(*)::int n from cmp_event where actor_id=$1 and action=$2 and created_at > now() - interval '24 hours'`, [userId, "group.create"]);
      if (n.n >= perDay) throw new HttpError(429, `Llegaste al máximo de ${perDay} grupos por día.`);
      const mats = await run(`select distinct matricula from club_account where user_id=$1 and matricula is not null`, [userId]);
      const [g] = await run(`insert into cmp_group (name, owner_id, share_token, share_enabled) values ($1,$2,$3,true) returning id, name, share_token, share_enabled, share_expires_at`, [nm, userId, newToken()]);
      await run(`insert into cmp_member (group_id, matricula, user_id, status, invited_by, responded_at, role) values ($1,$2,$3,'accepted',$3,now(),'admin')`, [g.id, mats[0]?.matricula || `u:${userId.slice(0, 8)}`, userId]);
      await run(`insert into cmp_event (actor_id, action, group_id, member_id, detail) values ($1,$2,$3,$4,$5)`, [userId, "group.create", g.id, null, null]);
      if (key) {
        const stored = await run(`insert into cmp_create_key (user_id, idem_key, group_id, payload_hash) values ($1,$2,$3,$4) on conflict (user_id, idem_key) do nothing returning group_id`, [userId, key, g.id, payload]);
        if (!stored.length) {
          const winner = await loadReplay(run, userId, key);
          throw new LostCreateRace(winner?.row, winner?.invited || []);
        }
      }
      return { replay: false as const, result: presentCreatedGroup(g, [], linkInfo(g), null), group: g };
    }, connect);
    return created;
  } catch (e) {
    if (e instanceof LostCreateRace) return { replay: true as const, result: presentCreatedGroup(e.row, e.invited, linkInfo(e.row), photoOf(e.row)) };
    throw e;
  }
}

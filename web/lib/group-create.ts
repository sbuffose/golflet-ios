import { createHash } from "node:crypto";

/** Group create contract. Same idempotency key replays one group. A new key with the same name is a different group. Photo is not required. */

export function normalizeIdempotencyKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim();
  if (!k || k.length > 80 || /[\r\n]/.test(k)) return null;
  return k;
}

/** Binds a key to the request that created the group: the name and the matrículas asked for, not the display name alone. */
export function groupCreatePayloadHash(name: string, matriculas: unknown): string {
  const mats = (Array.isArray(matriculas) ? matriculas : []).map(m => String(m).trim()).filter(Boolean).sort();
  return createHash("sha256").update(JSON.stringify({ name, matriculas: mats })).digest("hex");
}

export function presentCreatedGroup(g: { id: string; name: string }, invited: unknown[], link: unknown, photoUrl: string | null = null) {
  return {
    id: g.id,
    name: g.name,
    invited,
    link,
    group: { id: g.id, name: g.name, photo_url: photoUrl, is_admin: true as const },
  };
}

export type LedgerRow = { id: string; name: string };
export function createWithLedger(ledger: Map<string, LedgerRow>, userId: string, key: string | null, name: string, mint: () => string): LedgerRow & { replay: boolean } {
  const slot = key ? `${userId}\0${key}` : null;
  const prev = slot ? ledger.get(slot) : undefined;
  if (prev) return { ...prev, replay: true };
  const row = { id: mint(), name };
  if (slot) ledger.set(slot, row);
  return { ...row, replay: false };
}

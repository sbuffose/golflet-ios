/** Reservation refresh rules. No club I/O.
 *  A visit always starts a read. Overlapping visits share the one read already in flight.
 *  A visit that starts after that read finished starts another. There is no freshness TTL.
 *  checkedAt moves only after a successful source read. A failure keeps the previous stamp. */

export type BookingSnap = {
  id: string;
  userId: string;
  date: string;
  time: string;
  course: string | null;
  gone: boolean;
};

export type BookingDelta = { new: string[]; changed: string[]; gone: string[] };

export function shareFlight<T>(flights: Map<string, Promise<T>>, key: string, start: () => Promise<T>): Promise<T> {
  const existing = flights.get(key);
  if (existing) return existing;
  let job!: Promise<T>;
  job = Promise.resolve().then(start).finally(() => {
    if (flights.get(key) === job) flights.delete(key);
  });
  flights.set(key, job);
  return job;
}

/** Other people's rows never become this player's new, changed, or cancelled bookings. */
export function diffSnaps(before: BookingSnap[], after: BookingSnap[], userId: string): BookingDelta {
  const was = new Map(before.filter(r => r.userId === userId).map(r => [r.id, r]));
  const now = new Map(after.filter(r => r.userId === userId).map(r => [r.id, r]));
  const nw: string[] = [], changed: string[] = [], gone: string[] = [];
  for (const [id, row] of now) {
    const prev = was.get(id);
    if (row.gone) {
      if (prev && !prev.gone) gone.push(id);
      continue;
    }
    if (!prev || prev.gone) nw.push(id);
    else if (prev.date !== row.date || prev.time !== row.time || (prev.course || null) !== (row.course || null)) changed.push(id);
  }
  for (const [id, prev] of was) if (!prev.gone && !now.has(id)) gone.push(id);
  return { new: nw, changed, gone };
}

/** A successful page read stamps now. An error or a missing page keeps the previous stamp. */
export function nextCheckedAt(previous: string | null, outcome: "ok" | "empty" | "error" | "missing", now: string): string | null {
  if (outcome === "ok" || outcome === "empty") return now;
  return previous;
}

/** Explicit "Actualizar reserva" re-reads companions. A plain visit only re-reads the booking list. */
export function companionMode(action: "visit" | "players"): { light: boolean } {
  return { light: action !== "players" };
}

/** What "Traer última tarjeta" may say. A failed or empty read never counts as a new card. */
export function latestCardOutcome(results: { ok: boolean; newRounds: number; message?: string | null }[]): { phase: "fresh" | "none" | "error"; note: string } {
  if (!results.length) return { phase: "error", note: "No hay una clave guardada para leer el club." };
  const ok = results.filter(r => r.ok);
  const added = ok.reduce((s, r) => s + (r.newRounds || 0), 0);
  if (!ok.length) return { phase: "error", note: results.find(r => r.message)?.message || "No pudimos leer el club. La tarjeta en pantalla no cambió." };
  if (added <= 0) return { phase: "none", note: "No hay una tarjeta nueva. La última sigue siendo la que ya ves." };
  return { phase: "fresh", note: added === 1 ? "Llegó una tarjeta nueva." : `Llegaron ${added} tarjetas nuevas.` };
}

export type ReservationPhase = "checking" | "fresh" | "error" | "offline" | "no_account";

/** Honest label. `when` is the stamp of a real source read, never the moment we merely showed the cache. */
export function reservationNote(phase: ReservationPhase, when: string | null): string {
  if (phase === "checking") return "Revisando";
  if (phase === "no_account") return "No hay una matrícula vinculada para leer reservas.";
  if (phase === "offline") return when ? `Sin conexión: mostramos la última lectura · ${when}.` : "Sin conexión: mostramos la última lectura.";
  if (phase === "error") return when ? `No pudimos verificar las reservas. Última lectura: ${when}.` : "No pudimos verificar las reservas.";
  return when ? `Leídas del club · ${when}.` : "Leídas del club.";
}

export type ReservationView = {
  phase: ReservationPhase;
  note: string;
  teeTimes: unknown[] | null;
  checkedAt: string | null;
  lastCheckedAt: string | null;
};

type ReadResult = {
  status: "checked" | "error" | "no_account";
  fresh: boolean;
  checked_at: string | null;
  last_checked_at: string | null;
  tee_times?: unknown[];
};

/** One in-flight read per owner. Offline never pretends the cache was just read. */
export function createReservationRefresh(read: () => Promise<ReadResult>) {
  let flight: Promise<ReservationView> | null = null;
  let reads = 0;
  const enter = (online: boolean): Promise<ReservationView> => {
    if (!online) {
      return Promise.resolve({ phase: "offline", note: reservationNote("offline", null), teeTimes: null, checkedAt: null, lastCheckedAt: null });
    }
    if (flight) return flight;
    reads += 1;
    const job = read().then((r): ReservationView => {
      const phase: ReservationPhase = r.status === "no_account" ? "no_account" : r.fresh ? "fresh" : "error";
      const when = phase === "fresh" ? r.checked_at : r.last_checked_at;
      return { phase, note: reservationNote(phase, when), teeTimes: r.tee_times ?? null, checkedAt: r.fresh ? r.checked_at : null, lastCheckedAt: r.last_checked_at };
    }).catch((): ReservationView => ({
      phase: "error", note: reservationNote("error", null), teeTimes: null, checkedAt: null, lastCheckedAt: null,
    })).finally(() => { if (flight === job) flight = null; });
    flight = job;
    return job;
  };
  return { enter, reads: () => reads };
}

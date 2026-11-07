/**
 * "Vs jugadores de tu nivel" (Cancha). Anonymous benchmark against OTHER players on the same course and tee whose Handicap Index
 * at the time of each round was within ±3 of the viewer's current HI. Shown only with ≥5 distinct players AND ≥20 rounds.
 * Peers are never identified: only averages, per-hole averages and binned distributions leave the server.
 * Test accounts (@example.com) are benchmarked only against test accounts, and real players only against real players.
 */
import { q } from "./db";
import { HttpError } from "./http-error";
import { buildData } from "./data";

import { computeBenchmark, histogram, betterThan, holeAverages, type R } from "./benchmark-core";
export { BAND, MIN_PLAYERS, MIN_ROUNDS } from "./benchmark-core";
const normTee = (t: unknown) => String(t ?? "").trim().toLowerCase();

async function peerRounds(viewerId: string, test: boolean, clubId: number, course: string, tee: string) {
  const rows = await q(`select a.user_id uid, r.date::text date, (r.data->>'gross')::int gross, nullif(r.data->>'net','')::numeric net,
        nullif(r.data->>'handicap_index','')::numeric hi, r.holes
      from round r join club_account a on a.id=r.club_account_id join "user" u on u.id=a.user_id
      where a.user_id <> $1 and a.club_id=$2 and r.course=$3 and lower(trim(r.data->>'tee'))=$4
        and coalesce((r.data->>'valid_card')::boolean,false) and not coalesce((r.data->>'is_9_holes')::boolean,false)
        and not coalesce((r.data->>'other_course')::boolean,false) and coalesce(r.data->>'gross','') ~ '^[0-9]+$'
        and (u.email like '%@example.com') = $5`, [viewerId, clubId, course, tee, test]);
  const seen = new Set<string>(), out: R[] = [];       // the same card can be stored under several club accounts of one player
  for (const x of rows) { const k = `${x.uid}|${x.date}|${x.gross}`; if (seen.has(k)) continue; seen.add(k);
    out.push({ uid: x.uid, date: x.date, gross: Number(x.gross), net: x.net == null ? null : Number(x.net), hi: x.hi == null ? null : Number(x.hi), holes: Array.isArray(x.holes) ? x.holes : [] }); }
  return out;
}

export async function courseBenchmark(viewerId: string, viewerEmail: string, courseKey: string, teeIn?: string | null, dist?: { metric: string; hole?: number | null }) {
  const m = /^(\d+):(.{1,120})$/.exec(courseKey || ""); if (!m) throw new HttpError(400, "Cancha inválida");
  const clubId = Number(m[1]), course = m[2];
  const D: any = await buildData(viewerId);
  const c = (D.courses || []).find((x: any) => x.key === courseKey);
  const myAll = (D.rounds || []).filter((r: any) => r.course_key === courseKey && !r.other_course && r.valid_card && !r.is_9_holes && r.gross);
  const tees = Object.entries(myAll.reduce((a: any, r: any) => { const t = normTee(r.tee); if (t) { a[t] = a[t] || { tee: r.tee, rounds: 0 }; a[t].rounds++; } return a; }, {}))
    .map(([, v]: any) => v).sort((a: any, b: any) => b.rounds - a.rounds);
  const tee = teeIn ? normTee(teeIn) : normTee(tees[0]?.tee);
  if (!tee) throw new HttpError(404, "No tenés tarjetas válidas en esta cancha.");
  const mine: R[] = myAll.filter((r: any) => normTee(r.tee) === tee).map((r: any) => ({ date: r.date, gross: Number(r.gross), net: r.net == null ? null : Number(r.net), holes: r.holes || [] }));
  const hiRaw = D.player?.handicap_index ?? (D.hi_history || []).at(-1)?.hi ?? null, hi = hiRaw == null ? null : Number(hiRaw);
  const test = /@example\.com$/i.test(viewerEmail || "");
  const peers = await peerRounds(viewerId, test, clubId, course, tee);
  const b = computeBenchmark(mine, peers, hi);
  const { _inBand, ...pub } = b;
  const out: any = { course: { key: courseKey, club_name: c?.club_name ?? null, label: c?.label ?? course, par: c?.par ?? null }, tee: tees.find((t: any) => normTee(t.tee) === tee)?.tee ?? teeIn ?? tee,
    tees, ...pub, note: hi == null ? "Sin Hándicap Index no podemos armar el grupo de comparación." : null };
  if (dist && b.sufficient) {
    if (dist.metric === "gross" || dist.metric === "net") {
      const k = dist.metric as "gross" | "net", pv = _inBand.map(r => r[k]).filter((v): v is number => v != null), mv = mine.map(r => r[k]).filter((v): v is number => v != null);
      out.distribution = { metric: k, bins: histogram(pv, 2), me_avg: k === "gross" ? b.me.avg_gross : b.me.avg_net, me_bins: histogram(mv, 2), better_than_pct: betterThan(k === "gross" ? b.me.avg_gross : b.me.avg_net, pv), lower_is_better: true };
    } else if (dist.metric === "hole" && dist.hole) {
      const cnt = (rs: R[]) => { const o = { eagle_or_better: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple_or_worse: 0, n: 0 };
        for (const r of rs) { const h = r.holes.find(x => x[0] === dist.hole); if (!h || h[1] == null || h[2] == null) continue; const d = h[2] - h[1]; o.n++;
          if (d <= -2) o.eagle_or_better++; else if (d === -1) o.birdie++; else if (d === 0) o.par++; else if (d === 1) o.bogey++; else if (d === 2) o.double++; else o.triple_or_worse++; } return o; };
      const ph = holeAverages(_inBand).find(h => h.hole === dist.hole), mh = b.me.holes.find(h => h.hole === dist.hole);
      out.distribution = { metric: "hole", hole: dist.hole, par: ph?.par ?? mh?.par ?? null, bench: cnt(_inBand), me: cnt(mine), bench_avg_to_par: ph?.avg_to_par ?? null, me_avg_to_par: mh?.avg_to_par ?? null };
    } else throw new HttpError(400, "metric: gross | net | hole (con hole=N)");
  }
  return out;
}

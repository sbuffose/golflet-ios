/** TEST-ONLY. Driver history is the measured tee shot, not the bag carry and not an approach. */
import assert from "node:assert/strict";
import test from "node:test";
import { clubDetail } from "../lib/club-stats";
import type { ShotOut } from "../lib/shots-calc";

const clubs = [{ code: "Dr", label: "Driver", enabled: true }, { code: "7i", label: "Hierro 7", enabled: true }];
function shot(over: Partial<ShotOut>): ShotOut {
  return {
    id: "s", hole: 1, shot_number: 1, lat: 1, lng: 1, accuracy_m: 4, club: "Dr", lie: "tee", result: "fairway",
    taken_at: "2026-01-01", distance_m: 220, distance_yd: 241, distance_source: "next_shot", to_green_m: 380, to_green_yd: 416,
    source: "gps", distance_kind: "measured", ...over,
  };
}

test("the driver first-shot history ignores approaches and other clubs", () => {
  const detail = clubDetail("Dr", clubs, [
    shot({ id: "tee", distance_m: 210 }),
    shot({ id: "approach", shot_number: 2, lie: "fairway", to_green_m: 140, distance_m: 90 }),
    shot({ id: "iron", club: "7i", distance_m: 150 }),
    shot({ id: "short", shot_number: 1, lie: "tee", to_green_m: 120, distance_m: 120 }),
  ], []);
  assert.equal(detail.tee_shots?.n, 1);
  assert.equal(detail.tee_shots?.avg_yd, Math.round(210 / 0.9144));
  const iron = clubDetail("7i", clubs, [shot({ id: "iron", club: "7i", distance_m: 150 })], []);
  assert.equal(iron.tee_shots, null);
  const empty = clubDetail("Dr", clubs, [], []);
  assert.equal(empty.tee_shots, null);
});

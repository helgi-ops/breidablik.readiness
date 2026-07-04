import { test } from "vitest";
import assert from "node:assert/strict";
import { pickHeroStat, seasonBests, type ShareStats } from "../pickHeroStat";

const S = (topSpeed: number, distance: number, sprints: number): ShareStats => ({ topSpeed, distance, sprints });

test("first match: everything is a season best → top-speed hero with seasonBest badge (priority)", () => {
  const m = S(31.8, 10300, 420);
  const res = pickHeroStat(m, [m]);
  assert.equal(res.heroKey, "topSpeed");
  assert.equal(res.badge, "seasonBest");
});

test("season best on distance only → distance hero, seasonBest badge", () => {
  const history = [S(33, 9000, 500), S(32, 9500, 480)];
  const m = S(31, 11000, 300); // distance is the season best, speed/sprints are not
  const res = pickHeroStat(m, [...history, m]);
  assert.equal(res.heroKey, "distance");
  assert.equal(res.badge, "seasonBest");
});

test("multiple season bests → Top Speed wins the tie", () => {
  const history = [S(30, 9000, 400)];
  const m = S(34, 12000, 600); // beats history on all three
  const res = pickHeroStat(m, [...history, m]);
  assert.equal(res.heroKey, "topSpeed");
  assert.equal(res.badge, "seasonBest");
});

test("no season best: highest ratio wins, matchHigh only if top-3", () => {
  // Build a season where this match is 2nd-best on sprints (top-3) but mid on others.
  const history = [
    S(34, 12000, 700), // best speed+dist, best sprint
    S(33, 11000, 450),
    S(33, 11500, 400),
    S(32, 10000, 300),
  ];
  const m = S(31, 10000, 660); // sprints ratio 660/700=.943 highest; rank 2 of season
  const res = pickHeroStat(m, [...history, m]);
  assert.equal(res.heroKey, "sprints");
  assert.equal(res.badge, "matchHigh");
});

test("no season best and outside top-3 → no badge", () => {
  const history = [
    S(35, 13000, 800),
    S(34, 12500, 750),
    S(34, 12000, 700),
    S(33, 11000, 650),
  ];
  const m = S(30, 9000, 600); // worst on everything, rank 5
  const res = pickHeroStat(m, [...history, m]);
  assert.equal(res.badge, null);
});

test("glitch / zero sprints never becomes a badged hero", () => {
  const history = [S(33, 11000, 500), S(32, 10000, 450)];
  const m = S(31, 9000, 0); // sprints missing
  const res = pickHeroStat(m, [...history, m]);
  assert.notEqual(res.heroKey, "sprints");
});

test("seasonBests aggregates the max of each metric", () => {
  const best = seasonBests([S(30, 9000, 400), S(34, 8000, 700), S(32, 12000, 500)]);
  assert.equal(best.topSpeed, 34);
  assert.equal(best.distance, 12000);
  assert.equal(best.sprints, 700);
});

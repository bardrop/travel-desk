// Unit tests for Travel Desk's own trip logic: budget math, itinerary merging,
// date changes and input checks. Amounts are worked out by hand from destinations.js.
import assert from "node:assert/strict";
import test from "node:test";
import { DESTINATIONS, ORIGIN_REGIONS } from "../site/js/destinations.js";
import {
  addDays,
  buildDays,
  describeDate,
  estimateBudget,
  fareBand,
  formatUsd,
  mergePlan,
  plannedItems,
  removeItems,
  retimeDays,
  roomsNeeded,
  savingsOptions,
  validateTrip,
} from "../site/js/trip-math.js";

const LISBON = DESTINATIONS.find((d) => d.id === "lisbon");
const KYOTO = DESTINATIONS.find((d) => d.id === "kyoto");
const IDS = DESTINATIONS.map((d) => d.id);

/** A uid maker that counts, so tests can predict uids. */
function counter() {
  let n = 0;
  return () => `item-${++n}`;
}

test("dates: add days across month and year ends, and describe them", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(describeDate("2026-11-10"), "Tue, Nov 10, 2026");
  assert.equal(describeDate("2027-01-02"), "Sat, Jan 2, 2027");
});

test("rooms: two travelers share a room", () => {
  assert.equal(roomsNeeded(1), 1);
  assert.equal(roomsNeeded(2), 1);
  assert.equal(roomsNeeded(3), 2);
  assert.equal(roomsNeeded(8), 4);
});

test("fares: the tier table reads both ways", () => {
  const there = fareBand("North America", "Europe");
  const back = fareBand("Europe", "North America");
  assert.deepEqual(there, back);
  assert.equal(there.low, 650);
  assert.equal(there.high, 1250);
  assert.equal(fareBand("Europe", "Europe").low, 90);
  // Every origin reaches every destination region.
  for (const origin of ORIGIN_REGIONS) {
    for (const dest of DESTINATIONS) {
      assert.ok(fareBand(origin, dest.region).high > 0, `${origin} -> ${dest.region}`);
    }
  }
});

test("money: whole dollars with thousands separators", () => {
  assert.equal(formatUsd(0), "$0");
  assert.equal(formatUsd(1234), "$1,234");
  assert.equal(formatUsd(250000), "$250,000");
});

test("budget: Lisbon, standard, 2 travelers, 4 nights, from North America", () => {
  const planned = [{ costPerPerson: 4 }, { costPerPerson: 22 }];
  const b = estimateBudget({
    destination: LISBON, nights: 4, travelers: 2, style: "standard",
    originRegion: "North America", planned, budgetCap: 3500,
  });
  // days = 5, rooms = 1
  const byKey = Object.fromEntries(b.lines.map((l) => [l.key, l]));
  assert.equal(byKey.lodging.low, 480); // 1 room x 4 nights x $120
  assert.equal(byKey.food.low, 550); // 2 x 5 days x $55
  assert.equal(byKey.transport.low, 120); // 2 x 5 x $12
  assert.equal(byKey.activities.low, 52); // ($4 + $22) x 2
  assert.equal(byKey.misc.low, 250); // 2 x 5 x $25
  assert.equal(byKey.flights.low, 1300); // $650 x 2
  assert.equal(byKey.flights.high, 2500); // $1,250 x 2
  assert.equal(b.groundTotal, 1452);
  assert.equal(b.totalLow, 2752);
  assert.equal(b.totalHigh, 3952);
  assert.equal(b.perPersonLow, 1376);
  assert.equal(b.perPersonHigh, 1976);
  assert.equal(b.perDayGround, 290);
  assert.equal(b.cap.status, "tight"); // 2,752 <= 3,500 < 3,952
  assert.equal(b.cap.headroom, -452);
  assert.equal(b.display.total, "$2,752 to $3,952");
});

test("budget: a third traveler needs a second room; swapped counts change the total", () => {
  const base = { destination: KYOTO, style: "budget", originRegion: "East Asia", planned: [], budgetCap: 0 };
  const a = estimateBudget({ ...base, nights: 3, travelers: 3 });
  const b = estimateBudget({ ...base, nights: 2, travelers: 4 });
  // a: rooms 2 x 3 nights x $70 = 420; food 3 x 4 x 30 = 360; transport 3 x 4 x 8 = 96;
  // misc 3 x 4 x 12 = 144; ground 1,020; flights 3 x 90..320 = 270..960
  assert.equal(a.rooms, 2);
  assert.equal(a.groundTotal, 1020);
  assert.equal(a.totalLow, 1290);
  assert.equal(a.totalHigh, 1980);
  assert.equal(a.cap, null);
  // b: rooms 2 x 2 x 70 = 280; food 4 x 3 x 30 = 360; transport 4 x 3 x 8 = 96;
  // misc 4 x 3 x 12 = 144; ground 880; flights 4 x 90..320 = 360..1,280
  assert.equal(b.groundTotal, 880);
  assert.equal(b.totalLow, 1240);
  assert.equal(b.totalHigh, 2160);
});

test("budget: cap status on both sides of each boundary", () => {
  const input = { destination: LISBON, nights: 4, travelers: 2, style: "standard", originRegion: "North America", planned: [] };
  // ground = 480 + 550 + 120 + 0 + 250 = 1,400; total 2,700 .. 3,900
  assert.equal(estimateBudget({ ...input, budgetCap: 3900 }).cap.status, "within");
  assert.equal(estimateBudget({ ...input, budgetCap: 3899 }).cap.status, "tight");
  assert.equal(estimateBudget({ ...input, budgetCap: 2700 }).cap.status, "tight");
  assert.equal(estimateBudget({ ...input, budgetCap: 2699 }).cap.status, "over");
});

test("savings: cheaper styles and one night fewer, biggest saving first", () => {
  const input = { destination: LISBON, nights: 4, travelers: 2, style: "standard", originRegion: "North America", planned: [], budgetCap: 0 };
  const options = savingsOptions(input);
  assert.deepEqual(options.map((o) => o.change), ["Travel in budget style", "Stay 3 nights instead of 4"]);
  // budget style: lodging 1 x 4 x 55 = 220; food 2 x 5 x 30 = 300; transport 2 x 5 x 7 = 70;
  // misc 2 x 5 x 12 = 120 -> ground 710, saving 1,400 - 710 = 690
  assert.equal(options[0].saves, 690);
  // 3 nights standard: 360 + 440 + 96 + 200 = 1,096, saving 304
  assert.equal(options[1].saves, 304);
  // The cheapest style has no cheaper style to offer.
  const cheapest = savingsOptions({ ...input, style: "budget", nights: 1 });
  assert.deepEqual(cheapest, []);
});

test("itinerary: a trip of N nights has N + 1 days", () => {
  const days = buildDays("2026-12-30", 3);
  assert.equal(days.length, 4);
  assert.deepEqual(days.map((d) => d.date), ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  assert.equal(days[0].label, "Wed, Dec 30, 2026");
  assert.deepEqual(days[0].items, []);
});

test("merge: places activities in their preferred slot and keeps existing items", () => {
  const uid = counter();
  const start = mergePlan(buildDays("2027-03-01", 2), [{ day: 1, activityId: "lisbon-tram-28" }], LISBON.activities, uid);
  const before = JSON.stringify(start.days);
  const result = mergePlan(start.days, [
    { day: 1, activityId: "lisbon-belem" },
    { day: 1, activityId: "lisbon-alfama-fado" },
    { day: 2, title: "Free time at the beach", slot: "afternoon" },
  ], LISBON.activities, uid);
  assert.equal(JSON.stringify(start.days), before, "mergePlan must not change its input");
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.days[0].items.map((i) => [i.slot, i.activityId]), [
    ["morning", "lisbon-tram-28"],
    ["afternoon", "lisbon-belem"],
    ["evening", "lisbon-alfama-fado"],
  ]);
  assert.equal(result.days[1].items[0].title, "Free time at the beach");
  assert.equal(result.days[1].items[0].costPerPerson, 0);
  assert.deepEqual(result.placed.map((p) => p.uid), ["item-2", "item-3", "item-4"]);
});

test("merge: a taken slot moves a flexible activity, and skips a fixed one with a reason", () => {
  const uid = counter();
  const first = mergePlan(buildDays("2027-03-01", 1), [
    { day: 1, activityId: "lisbon-tram-28" }, // morning
    { day: 1, activityId: "lisbon-miradouros" }, // evening
  ], LISBON.activities, uid);
  const result = mergePlan(first.days, [
    { day: 1, activityId: "lisbon-lx-factory", slot: "morning" }, // any -> moves to afternoon
    { day: 1, activityId: "lisbon-alfama-fado" }, // evening only, taken
  ], LISBON.activities, uid);
  assert.deepEqual(result.placed.map((p) => [p.activityId, p.slot]), [["lisbon-lx-factory", "afternoon"]]);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].activityId, "lisbon-alfama-fado");
  assert.match(result.skipped[0].reason, /Day 1 has no free evening/);
});

test("merge: a full-day trip needs both the morning and the afternoon", () => {
  const uid = counter();
  const days = mergePlan(buildDays("2027-03-01", 1), [{ day: 1, activityId: "lisbon-tram-28" }], LISBON.activities, uid).days;
  const result = mergePlan(days, [
    { day: 1, activityId: "lisbon-sintra" },
    { day: 2, activityId: "lisbon-sintra" },
    { day: 2, activityId: "lisbon-belem" },
  ], LISBON.activities, uid);
  // Day 1 morning is taken. Day 2 gets Sintra, which fills its afternoon, so Belém
  // moves to... nowhere: its slots are afternoon or morning, both used by Sintra.
  assert.deepEqual(result.placed.map((p) => [p.day, p.activityId, p.slot]), [[2, "lisbon-sintra", "fullday"]]);
  assert.deepEqual(result.skipped.map((s) => s.activityId), ["lisbon-sintra", "lisbon-belem"]);
  assert.match(result.skipped[0].reason, /Day 1 has no free full day/);
});

test("merge: refuses unknown activities, days outside the trip, duplicates and wrong slots", () => {
  const uid = counter();
  const days = buildDays("2027-03-01", 2);
  const result = mergePlan(days, [
    { day: 4, activityId: "lisbon-belem" },
    { day: 0, activityId: "lisbon-belem" },
    { day: 1, activityId: "kyoto-nara" },
    { day: 1, activityId: "lisbon-belem" },
    { day: 2, activityId: "lisbon-belem" },
    { day: 2, activityId: "lisbon-alfama-fado", slot: "morning" },
    { day: 2 },
    { day: 2, activityId: "lisbon-belem", title: "Both" },
  ], LISBON.activities, uid);
  assert.deepEqual(result.placed.map((p) => p.activityId), ["lisbon-belem"]);
  const reasons = result.skipped.map((s) => s.reason);
  assert.match(reasons[0], /Day 4 is not in this trip \(days 1 to 3\)/);
  assert.match(reasons[1], /Day 0 is not in this trip/);
  assert.match(reasons[2], /kyoto-nara is not an activity in this destination/);
  assert.match(reasons[3], /already planned on day 1/);
  assert.match(reasons[4], /evening activity/);
  assert.match(reasons[5], /Give an activityId or a title/);
  assert.match(reasons[6], /Give an activityId or a title/);
});

test("remove: removes by uid and reports unknown uids", () => {
  const uid = counter();
  const days = mergePlan(buildDays("2027-03-01", 1), [
    { day: 1, activityId: "lisbon-tram-28" },
    { day: 2, activityId: "lisbon-belem" },
  ], LISBON.activities, uid).days;
  const result = removeItems(days, ["item-1", "nope"]);
  assert.deepEqual(result.removed.map((r) => r.uid), ["item-1"]);
  assert.deepEqual(result.missing, ["nope"]);
  assert.deepEqual(plannedItems(result.days).map((i) => i.uid), ["item-2"]);
  assert.equal(plannedItems(days).length, 2, "removeItems must not change its input");
});

test("retime: moving dates keeps items by day number; shortening refuses to drop items", () => {
  const uid = counter();
  const days = mergePlan(buildDays("2027-03-01", 3), [
    { day: 1, activityId: "lisbon-tram-28" },
    { day: 4, activityId: "lisbon-belem" },
  ], LISBON.activities, uid).days;
  const moved = retimeDays(days, "2027-04-10", 5);
  assert.equal(moved.ok, true);
  assert.equal(moved.days.length, 6);
  assert.equal(moved.days[0].date, "2027-04-10");
  assert.equal(moved.days[3].items[0].activityId, "lisbon-belem");
  const shorter = retimeDays(days, "2027-03-01", 2);
  assert.equal(shorter.ok, false);
  assert.match(shorter.reason, /would remove 1 planned item on day 4/);
  // Shortening is fine when the last days are empty.
  assert.equal(retimeDays(days, "2027-03-01", 3).ok, true);
});

test("validate: accepts the limits and refuses each bad field with its name", () => {
  const ctx = { today: "2026-11-13", destinationIds: IDS, regions: ORIGIN_REGIONS };
  const good = {
    destinationId: "lisbon", startDate: "2026-11-13", nights: 14, travelers: 8,
    style: "comfort", originRegion: "Europe", budgetCap: 250000,
  };
  assert.equal(validateTrip(good, ctx).ok, true);
  assert.equal(validateTrip({ ...good, startDate: "2027-11-13", nights: 1, travelers: 1, budgetCap: 0 }, ctx).ok, true);
  const cases = [
    [{ destinationId: "atlantis" }, "destinationId"],
    [{ startDate: "2026-11-12" }, "startDate"],
    [{ startDate: "2027-11-14" }, "startDate"],
    [{ startDate: "2026-02-30" }, "startDate"],
    [{ startDate: "13/11/2026" }, "startDate"],
    [{ nights: 0 }, "nights"],
    [{ nights: 15 }, "nights"],
    [{ nights: 2.5 }, "nights"],
    [{ travelers: 9 }, "travelers"],
    [{ style: "luxury" }, "style"],
    [{ originRegion: "Mars" }, "originRegion"],
    [{ budgetCap: -1 }, "budgetCap"],
    [{ budgetCap: 250001 }, "budgetCap"],
  ];
  for (const [patch, field] of cases) {
    const result = validateTrip({ ...good, ...patch }, ctx);
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.equal(result.field, field, JSON.stringify(patch));
    assert.ok(result.reason.length > 10);
  }
});

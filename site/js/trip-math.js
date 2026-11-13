// Travel Desk's trip rules: dates, budget math, itinerary merging and input checks.
// Pure functions with no DOM, so the page, the agents' tools and the tests share them.
import { FARE_TIERS, REGION_TIERS } from "./destinations.js";

export const STYLES = ["budget", "standard", "comfort"];
export const SLOTS = ["morning", "afternoon", "evening"];
export const LIMITS = {
  minNights: 1,
  maxNights: 14,
  minTravelers: 1,
  maxTravelers: 8,
  maxBudgetCap: 250000,
  horizonDays: 365,
  maxTitle: 60,
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SLOT_WORDS = { morning: "morning", afternoon: "afternoon", evening: "evening", fullday: "full day" };

/**
 * Read a strict YYYY-MM-DD date as a UTC Date, or null when it is not a real date.
 */
export function parseIsoDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ""));
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** Format a UTC Date as YYYY-MM-DD. */
export function isoOf(date) {
  return date.toISOString().slice(0, 10);
}

/** The ISO date n days after iso. */
export function addDays(iso, n) {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + n);
  return isoOf(date);
}

/** Whole days from a to b (both ISO dates). */
export function daysBetween(a, b) {
  return Math.round((parseIsoDate(b) - parseIsoDate(a)) / 86400000);
}

/** "Tue, Nov 10, 2026" for "2026-11-10". */
export function describeDate(iso) {
  const date = parseIsoDate(iso);
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** Two travelers share a room. */
export function roomsNeeded(travelers) {
  return Math.ceil(travelers / 2);
}

/** "$1,234" for 1234. Amounts are whole US dollars. */
export function formatUsd(amount) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** The round-trip fare band per traveler between two regions. */
export function fareBand(originRegion, destinationRegion) {
  const tier = REGION_TIERS[originRegion]?.[destinationRegion] ?? REGION_TIERS[destinationRegion]?.[originRegion];
  if (tier === undefined) throw new Error(`No fare tier for ${originRegion} to ${destinationRegion}`);
  return { ...FARE_TIERS[tier] };
}

/**
 * Estimate a trip's cost in whole US dollars.
 *
 * days = nights + 1. Lodging is per room per night; food, local transport and
 * unplanned spending are per traveler per day; planned activities are per traveler.
 * Flights come as a low-to-high band, so totals do too.
 *
 * :param input: destination, nights, travelers, style, originRegion, planned
 *   (items with costPerPerson) and budgetCap (0 or missing for none).
 */
export function estimateBudget({ destination, nights, travelers, style, originRegion, planned = [], budgetCap = 0 }) {
  const rates = destination.costs[style];
  const days = nights + 1;
  const rooms = roomsNeeded(travelers);
  const band = fareBand(originRegion, destination.region);
  const plannedPerPerson = planned.reduce((sum, item) => sum + (item.costPerPerson || 0), 0);
  const flat = (key, label, amount, basis) => ({ key, label, low: amount, high: amount, basis });
  const lines = [
    { key: "flights", label: "Flights (round trip)", low: band.low * travelers, high: band.high * travelers,
      basis: `${travelers} × ${formatUsd(band.low)} to ${formatUsd(band.high)} (${band.label} from ${originRegion})` },
    flat("lodging", "Lodging", rooms * nights * rates.lodging,
      `${rooms} room${rooms > 1 ? "s" : ""} × ${nights} night${nights > 1 ? "s" : ""} × ${formatUsd(rates.lodging)}`),
    flat("food", "Food", travelers * days * rates.food, `${travelers} × ${days} days × ${formatUsd(rates.food)}`),
    flat("transport", "Local transport", travelers * days * rates.transport,
      `${travelers} × ${days} days × ${formatUsd(rates.transport)}`),
    flat("activities", "Planned activities", plannedPerPerson * travelers,
      `${travelers} × ${formatUsd(plannedPerPerson)} of planned activities`),
    flat("misc", "Unplanned spending", travelers * days * rates.misc, `${travelers} × ${days} days × ${formatUsd(rates.misc)}`),
  ];
  const groundTotal = lines.slice(1).reduce((sum, line) => sum + line.low, 0);
  const totalLow = groundTotal + lines[0].low;
  const totalHigh = groundTotal + lines[0].high;
  let cap = null;
  if (budgetCap > 0) {
    const status = totalHigh <= budgetCap ? "within" : totalLow > budgetCap ? "over" : "tight";
    cap = { amount: budgetCap, status, headroom: budgetCap - totalHigh };
  }
  const perPersonLow = Math.round(totalLow / travelers);
  const perPersonHigh = Math.round(totalHigh / travelers);
  return {
    destinationId: destination.id,
    nights, days, travelers, rooms, style, originRegion,
    lines, groundTotal, totalLow, totalHigh, perPersonLow, perPersonHigh,
    perDayGround: Math.round(groundTotal / days),
    cap,
    display: {
      total: `${formatUsd(totalLow)} to ${formatUsd(totalHigh)}`,
      perPerson: `${formatUsd(perPersonLow)} to ${formatUsd(perPersonHigh)}`,
      groundTotal: formatUsd(groundTotal),
      perDayGround: formatUsd(Math.round(groundTotal / days)),
      cap: cap ? formatUsd(cap.amount) : "none",
    },
    note: "Rough planning bands compiled by Travel Desk in 2026, not live prices or quotes.",
  };
}

/**
 * Cheaper versions of the same trip: each cheaper style, and one night fewer.
 * Flights do not change, so the saving is the change in the ground total.
 */
export function savingsOptions(input) {
  const base = estimateBudget(input).groundTotal;
  const options = [];
  for (const style of STYLES.slice(0, STYLES.indexOf(input.style))) {
    const cheaper = estimateBudget({ ...input, style });
    options.push({ change: `Travel in ${style} style`, patch: { style }, saves: base - cheaper.groundTotal,
      display: { total: cheaper.display.total } });
  }
  if (input.nights > 1) {
    const shorter = estimateBudget({ ...input, nights: input.nights - 1 });
    options.push({ change: `Stay ${input.nights - 1} night${input.nights > 2 ? "s" : ""} instead of ${input.nights}`,
      patch: { nights: input.nights - 1 }, saves: base - shorter.groundTotal, display: { total: shorter.display.total } });
  }
  options.sort((a, b) => b.saves - a.saves);
  for (const option of options) option.display.saves = formatUsd(option.saves);
  return options;
}

/** The days of a trip: nights + 1 days from startDate, each with no items. */
export function buildDays(startDate, nights) {
  const days = [];
  for (let i = 0; i <= nights; i++) {
    const date = addDays(startDate, i);
    days.push({ day: i + 1, date, label: describeDate(date), items: [] });
  }
  return days;
}

/** The slots an item uses: a full day takes the morning and the afternoon. */
function usedSlots(slot) {
  return slot === "fullday" ? ["morning", "afternoon"] : [slot];
}

/** The slots an activity may go in, in order of preference. */
function allowedSlots(kind) {
  switch (kind) {
    case "fullday": return ["fullday"];
    case "evening": return ["evening"];
    case "morning": return ["morning", "afternoon"];
    case "afternoon": return ["afternoon", "morning"];
    default: return ["morning", "afternoon", "evening"];
  }
}

function copyDays(days) {
  return days.map((d) => ({ ...d, items: d.items.map((item) => ({ ...item })) }));
}

/** Every planned item, in day and slot order, with its day number. */
export function plannedItems(days) {
  return days.flatMap((d) => d.items.map((item) => ({ ...item, day: d.day })));
}

/**
 * Merge proposed items into an itinerary without changing the input.
 *
 * Keeps every existing item. Places each proposal in its requested slot, or the
 * activity's preferred slot, or the next free slot the activity allows. Skips, with a
 * reason, a day outside the trip, an unknown activity, an activity already planned and
 * a day with no free slot it allows.
 *
 * :param days: The current days.
 * :param proposals: [{day, activityId?, title?, slot?}], day starting at 1.
 * :param activities: The destination's activity catalog.
 * :param makeUid: Returns a new unique id for each placed item.
 * :return: {days, placed, skipped}.
 */
export function mergePlan(days, proposals, activities, makeUid) {
  const next = copyDays(days);
  const byId = new Map(activities.map((a) => [a.id, a]));
  const plannedOn = new Map(plannedItems(next).filter((i) => i.activityId).map((i) => [i.activityId, i.day]));
  const placed = [];
  const skipped = [];
  for (const proposal of proposals) {
    const skip = (reason) => skipped.push({ ...proposal, reason });
    const day = next[proposal.day - 1];
    if (!Number.isInteger(proposal.day) || !day) {
      skip(`Day ${proposal.day} is not in this trip (days 1 to ${next.length}).`);
      continue;
    }
    const hasId = Boolean(proposal.activityId);
    const hasTitle = Boolean(String(proposal.title || "").trim());
    if (hasId === hasTitle) {
      skip("Give an activityId or a title, not both.");
      continue;
    }
    let item;
    if (hasId) {
      const activity = byId.get(proposal.activityId);
      if (!activity) {
        skip(`${proposal.activityId} is not an activity in this destination.`);
        continue;
      }
      if (plannedOn.has(activity.id)) {
        skip(`${activity.name} is already planned on day ${plannedOn.get(activity.id)}.`);
        continue;
      }
      item = { activityId: activity.id, title: activity.name, kind: activity.slot,
        costPerPerson: activity.costPerPerson, hours: activity.hours };
    } else {
      const title = String(proposal.title).trim().slice(0, LIMITS.maxTitle);
      item = { activityId: null, title, kind: proposal.slot === "fullday" ? "fullday" : "any", costPerPerson: 0, hours: null };
    }
    const allowed = allowedSlots(item.kind);
    if (proposal.slot && !allowed.includes(proposal.slot)) {
      skip(`${item.title} is ${item.kind === "evening" ? "an evening activity" : `a ${SLOT_WORDS[item.kind] || item.kind} activity`}, so it cannot go in the ${SLOT_WORDS[proposal.slot] || proposal.slot}.`);
      continue;
    }
    const order = proposal.slot ? [proposal.slot, ...allowed.filter((s) => s !== proposal.slot)] : allowed;
    const taken = new Set(day.items.flatMap((i) => usedSlots(i.slot)));
    const slot = order.find((s) => usedSlots(s).every((u) => !taken.has(u)));
    if (!slot) {
      const words = allowed.map((s) => SLOT_WORDS[s]).join(" or ");
      skip(`Day ${day.day} has no free ${words} for ${item.title}.`);
      continue;
    }
    const placedItem = { uid: makeUid(), activityId: item.activityId, title: item.title, slot,
      costPerPerson: item.costPerPerson, hours: item.hours };
    day.items.push(placedItem);
    day.items.sort((a, b) => SLOTS.indexOf(usedSlots(a.slot)[0]) - SLOTS.indexOf(usedSlots(b.slot)[0]));
    if (item.activityId) plannedOn.set(item.activityId, day.day);
    placed.push({ ...placedItem, day: day.day });
  }
  return { days: next, placed, skipped };
}

/** Remove items by uid without changing the input. */
export function removeItems(days, uids) {
  const wanted = new Set(uids);
  const removed = [];
  const next = days.map((d) => ({
    ...d,
    items: d.items.filter((item) => {
      if (!wanted.has(item.uid)) return true;
      removed.push({ ...item, day: d.day });
      return false;
    }).map((item) => ({ ...item })),
  }));
  const found = new Set(removed.map((r) => r.uid));
  return { days: next, removed, missing: uids.filter((u) => !found.has(u)) };
}

/**
 * Move the itinerary to new dates, keeping each item on the same day number.
 * Refuses, changing nothing, when fewer days would drop planned items.
 */
export function retimeDays(days, startDate, nights) {
  const fresh = buildDays(startDate, nights);
  const lost = plannedItems(days).filter((item) => item.day > fresh.length);
  if (lost.length) {
    const dayList = [...new Set(lost.map((i) => i.day))].join(", ");
    return {
      ok: false,
      field: "nights",
      reason: `That would remove ${lost.length} planned item${lost.length > 1 ? "s" : ""} on day ${dayList}. Remove ${lost.length > 1 ? "them" : "it"} first, or keep more nights.`,
      lost,
    };
  }
  for (const d of days) {
    if (fresh[d.day - 1]) fresh[d.day - 1].items = d.items.map((item) => ({ ...item }));
  }
  return { ok: true, days: fresh };
}

/**
 * Check a whole trip. Returns {ok: true, value} with clean values, or
 * {ok: false, reason, field} for the first problem.
 *
 * :param input: destinationId, startDate, nights, travelers, style, originRegion, budgetCap.
 * :param ctx: today (ISO date), destinationIds and regions.
 */
export function validateTrip(input, { today, destinationIds, regions }) {
  const refuse = (field, reason) => ({ ok: false, field, reason });
  if (!destinationIds.includes(input.destinationId)) {
    return refuse("destinationId", `Pick one of the destinations on this page: ${destinationIds.join(", ")}.`);
  }
  if (!parseIsoDate(input.startDate)) {
    return refuse("startDate", "Give the start date as YYYY-MM-DD, for example 2027-03-14.");
  }
  const ahead = daysBetween(today, input.startDate);
  if (ahead < 0) return refuse("startDate", `The start date is in the past. Today is ${describeDate(today)}.`);
  if (ahead > LIMITS.horizonDays) {
    return refuse("startDate", `Plan up to ${LIMITS.horizonDays} days ahead: start on or before ${describeDate(addDays(today, LIMITS.horizonDays))}.`);
  }
  const whole = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!whole(input.nights, LIMITS.minNights, LIMITS.maxNights)) {
    return refuse("nights", `Nights must be a whole number from ${LIMITS.minNights} to ${LIMITS.maxNights}.`);
  }
  if (!whole(input.travelers, LIMITS.minTravelers, LIMITS.maxTravelers)) {
    return refuse("travelers", `Travelers must be a whole number from ${LIMITS.minTravelers} to ${LIMITS.maxTravelers}.`);
  }
  if (!STYLES.includes(input.style)) return refuse("style", `Style must be one of ${STYLES.join(", ")}.`);
  if (!regions.includes(input.originRegion)) return refuse("originRegion", `Home region must be one of ${regions.join(", ")}.`);
  const cap = input.budgetCap ?? 0;
  if (!whole(cap, 0, LIMITS.maxBudgetCap)) {
    return refuse("budgetCap", `The budget cap must be whole US dollars from 0 (no cap) to ${formatUsd(LIMITS.maxBudgetCap)}.`);
  }
  return {
    ok: true,
    value: {
      destinationId: input.destinationId, startDate: input.startDate, nights: input.nights,
      travelers: input.travelers, style: input.style, originRegion: input.originRegion, budgetCap: cap,
    },
  };
}

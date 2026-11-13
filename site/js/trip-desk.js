// The Travel Desk page: one trip, its day-by-day board and its budget.
// The page's own buttons and the assistant's website_* tools call the same methods on
// App.page, so both follow one set of rules (js/trip-math.js).
import { DESTINATIONS, ORIGIN_REGIONS } from "./destinations.js";
import {
  LIMITS, SLOTS, STYLES, addDays, buildDays, describeDate, estimateBudget, fareBand, formatUsd,
  mergePlan, plannedItems, removeItems, retimeDays, savingsOptions, validateTrip,
} from "./trip-math.js";

const STORAGE_KEY = "travel-desk-trip-v1";
const SLOT_LABELS = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", fullday: "Full day" };
const STYLE_LABELS = { budget: "Budget", standard: "Standard", comfort: "Comfort" };
const CAP_WORDS = {
  within: "Fits your cap, even at the high end.",
  tight: "Fits your cap only if flights come in low.",
  over: "Over your cap, even at the low end.",
};

/** Today's date in the visitor's time zone, as YYYY-MM-DD. */
function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** localStorage, or null where it is missing or blocked. */
function safeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export class TripDesk {
  /** Returns today's ISO date. Tests replace it to pin the date. */
  static clock = localToday;

  constructor(doc, storage) {
    this.doc = doc;
    this.storage = storage;
    this.trip = null;
    this.days = [];
    this.version = 0;
    this.uidSeq = 0;
    this.listeners = new Set();
  }

  // ---------- data the page and the agents read ----------

  destination(id) {
    return DESTINATIONS.find((d) => d.id === id) || null;
  }

  destinationIds() {
    return DESTINATIONS.map((d) => d.id);
  }

  activityIds() {
    return DESTINATIONS.flatMap((d) => d.activities.map((a) => a.id));
  }

  today() {
    return TripDesk.clock();
  }

  checkContext() {
    return { today: this.today(), destinationIds: this.destinationIds(), regions: ORIGIN_REGIONS };
  }

  /** The current budget estimate, or null with no trip. */
  budget() {
    if (!this.trip) return null;
    return estimateBudget({ ...this.trip, destination: this.destination(this.trip.destinationId), planned: plannedItems(this.days) });
  }

  /** A plain-JSON copy of everything the page shows. */
  getState() {
    const today = this.today();
    const trip = this.trip ? this.describeTrip(this.trip) : null;
    const budget = this.budget();
    return {
      today: { date: today, label: describeDate(today) },
      version: this.version,
      trip,
      days: this.days.map((d) => ({
        day: d.day, date: d.date, label: d.label,
        items: d.items.map((i) => ({ uid: i.uid, activityId: i.activityId, title: i.title, slot: i.slot,
          costPerPerson: formatUsd(i.costPerPerson) })),
      })),
      budget: budget ? TripDesk.budgetSummary(budget) : null,
      options: {
        destinations: DESTINATIONS.map((d) => ({ id: d.id, name: d.name, country: d.country, region: d.region })),
        originRegions: ORIGIN_REGIONS,
        styles: STYLES,
        limits: { nights: `${LIMITS.minNights} to ${LIMITS.maxNights}`, travelers: `${LIMITS.minTravelers} to ${LIMITS.maxTravelers}`,
          latestStart: addDays(today, LIMITS.horizonDays) },
      },
      cannotDo: "Travel Desk plans and estimates. It does not search live fares, book flights or rooms, take payments or check visas.",
    };
  }

  describeTrip(trip) {
    const dest = this.destination(trip.destinationId);
    const endDate = addDays(trip.startDate, trip.nights);
    return {
      destinationId: trip.destinationId, destination: `${dest.name}, ${dest.country}`,
      startDate: trip.startDate, startLabel: describeDate(trip.startDate),
      endDate, endLabel: describeDate(endDate),
      nights: trip.nights, travelers: trip.travelers, style: trip.style,
      originRegion: trip.originRegion, budgetCap: trip.budgetCap ? formatUsd(trip.budgetCap) : "none",
      budgetCapDollars: trip.budgetCap,
    };
  }

  static budgetSummary(b) {
    return {
      total: b.display.total, perPerson: b.display.perPerson, groundTotal: b.display.groundTotal,
      perDayOnTheGround: b.display.perDayGround, rooms: b.rooms,
      lines: b.lines.map((l) => ({ label: l.label, amount: l.low === l.high ? formatUsd(l.low) : `${formatUsd(l.low)} to ${formatUsd(l.high)}`, basis: l.basis })),
      cap: b.cap ? { amount: formatUsd(b.cap.amount), status: b.cap.status, meaning: CAP_WORDS[b.cap.status],
        headroomAtHighEnd: formatUsd(b.cap.headroom) } : null,
      note: b.note,
    };
  }

  /** The guide for one destination: neighborhoods, tips, activities, cost bands and fares. */
  getGuide(destinationId) {
    const dest = this.destination(destinationId);
    if (!dest) return { ok: false, reason: `Unknown destination. Pick one of: ${this.destinationIds().join(", ")}.` };
    return {
      ok: true,
      id: dest.id, name: dest.name, country: dest.country, region: dest.region, bestMonths: dest.bestMonths,
      gettingAround: dest.gettingAround, neighborhoods: dest.neighborhoods, etiquette: dest.etiquette,
      activities: dest.activities.map((a) => ({ id: a.id, name: a.name, slot: a.slot, hours: a.hours, costPerPerson: formatUsd(a.costPerPerson) })),
      costBands: Object.fromEntries(STYLES.map((s) => [s, {
        lodgingPerRoomNight: formatUsd(dest.costs[s].lodging), foodPerPersonDay: formatUsd(dest.costs[s].food),
        localTransportPerPersonDay: formatUsd(dest.costs[s].transport), unplannedPerPersonDay: formatUsd(dest.costs[s].misc),
      }])),
      roundTripFarePerTraveler: Object.fromEntries(ORIGIN_REGIONS.map((r) => {
        const band = fareBand(r, dest.region);
        return [r, `${formatUsd(band.low)} to ${formatUsd(band.high)} (${band.label})`];
      })),
      note: "Rough planning bands compiled by Travel Desk in 2026, not live prices or quotes. Check entry rules for your passport before booking.",
    };
  }

  /**
   * A what-if budget. Values not given come from the current trip. Changes nothing.
   */
  estimate(args = {}) {
    const base = this.trip || {};
    const input = {
      destinationId: args.destinationId ?? base.destinationId,
      nights: args.nights ?? base.nights,
      travelers: args.travelers ?? base.travelers,
      style: args.style ?? base.style,
      originRegion: args.originRegion ?? base.originRegion,
      budgetCap: args.budgetCap ?? base.budgetCap ?? 0,
    };
    const missing = Object.entries(input).filter(([, v]) => v === undefined).map(([k]) => k);
    if (missing.length) return { ok: false, reason: `No trip on the page yet, so give ${missing.join(", ")}.`, field: missing[0] };
    // Reuse the trip check with a valid start date: an estimate does not need one.
    const check = validateTrip({ ...input, startDate: this.today() }, this.checkContext());
    if (!check.ok) return check;
    const sameDestination = this.trip && input.destinationId === this.trip.destinationId;
    const planned = sameDestination ? plannedItems(this.days) : [];
    const full = { ...check.value, destination: this.destination(input.destinationId), planned };
    const estimate = estimateBudget(full);
    return {
      ok: true,
      scenario: { destinationId: input.destinationId, nights: input.nights, travelers: input.travelers, style: input.style,
        originRegion: input.originRegion, budgetCap: input.budgetCap ? formatUsd(input.budgetCap) : "none",
        includesPlannedActivities: planned.length },
      estimate: TripDesk.budgetSummary(estimate),
      cheaperOptions: savingsOptions(full).map((o) => ({ change: o.change, saves: o.display.saves, newTotal: o.display.total })),
    };
  }

  // ---------- operations ----------

  /**
   * Check a new trip without changing anything: the trip's fields and expectedVersion.
   * The confirmation dialog and startNewTrip both call it.
   */
  checkNewTrip(args) {
    if (args.expectedVersion !== this.version) {
      return { ok: false, field: "expectedVersion",
        reason: `The trip changed since it was read (version ${this.version}, not ${args.expectedVersion}). Read it again first.` };
    }
    const check = validateTrip(args, this.checkContext());
    if (!check.ok) return check;
    const clears = plannedItems(this.days).length;
    return { ok: true, value: check.value, clears, summary: this.describeTrip(check.value) };
  }

  /** Replace the trip and clear the board. Cannot be undone. */
  startNewTrip(args) {
    const check = this.checkNewTrip(args);
    if (!check.ok) return check;
    this.trip = check.value;
    this.days = buildDays(this.trip.startDate, this.trip.nights);
    this.version += 1;
    this.commit();
    return { ok: true, cleared: check.clears, trip: this.describeTrip(this.trip), version: this.version,
      budget: TripDesk.budgetSummary(this.budget()) };
  }

  /** Change dates, nights, travelers, style, home region or cap; keeps the board. */
  setTripDetails(patch) {
    if (!this.trip) return { ok: false, reason: "There is no trip yet. Start a new trip first." };
    if ("destinationId" in patch && patch.destinationId !== this.trip.destinationId) {
      return { ok: false, field: "destinationId", reason: "Changing the destination clears the board. Start a new trip instead." };
    }
    const check = validateTrip({ ...this.trip, ...patch }, this.checkContext());
    if (!check.ok) return check;
    const moved = retimeDays(this.days, check.value.startDate, check.value.nights);
    if (!moved.ok) return { ok: false, field: moved.field, reason: moved.reason };
    this.trip = check.value;
    this.days = moved.days;
    this.version += 1;
    this.commit();
    return { ok: true, version: this.version, trip: this.describeTrip(this.trip), budget: TripDesk.budgetSummary(this.budget()) };
  }

  /** Add activities or notes to days. Places what fits; reports what it skipped. */
  addItems(items) {
    if (!this.trip) return { ok: false, reason: "There is no trip yet. Start a new trip first." };
    const dest = this.destination(this.trip.destinationId);
    const result = mergePlan(this.days, items, dest.activities, () => `i${++this.uidSeq}`);
    if (!result.placed.length) {
      return { ok: false, reason: result.skipped.map((s) => s.reason).join(" "), skipped: result.skipped };
    }
    this.days = result.days;
    this.version += 1;
    this.commit();
    return {
      ok: true, version: this.version,
      placed: result.placed.map((p) => ({ uid: p.uid, day: p.day, slot: p.slot, title: p.title })),
      skipped: result.skipped.map((s) => ({ day: s.day, activityId: s.activityId, title: s.title, reason: s.reason })),
      budget: TripDesk.budgetSummary(this.budget()),
    };
  }

  /** Remove items from the board by uid. */
  removeItems(uids) {
    if (!this.trip) return { ok: false, reason: "There is no trip yet." };
    const result = removeItems(this.days, uids);
    if (result.missing.length) {
      return { ok: false, field: "uids", reason: `No item with uid ${result.missing.join(", ")} on the board. Read the trip again.` };
    }
    this.days = result.days;
    this.version += 1;
    this.commit();
    return { ok: true, version: this.version, removed: result.removed.map((r) => ({ uid: r.uid, day: r.day, title: r.title })),
      budget: TripDesk.budgetSummary(this.budget()) };
  }

  // ---------- storage and rendering ----------

  commit() {
    this.save();
    this.render();
    for (const listener of this.listeners) listener(this);
  }

  save() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ trip: this.trip, days: this.days, version: this.version, uidSeq: this.uidSeq }));
    } catch {
      // Private windows can refuse storage; the page still works for this visit.
    }
  }

  load() {
    if (!this.storage) return;
    try {
      const saved = JSON.parse(this.storage.getItem(STORAGE_KEY) || "null");
      if (!saved?.trip || !this.destination(saved.trip.destinationId)) return;
      this.trip = saved.trip;
      this.days = saved.days;
      this.version = saved.version;
      this.uidSeq = saved.uidSeq;
    } catch {
      // A damaged saved trip is ignored.
    }
  }

  el(id) {
    return this.doc.getElementById(id);
  }

  make(tag, text, className) {
    const node = this.doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  render() {
    this.renderSummary();
    this.renderBoard();
    this.renderBudget();
    this.renderGuide();
    this.fillForm();
  }

  renderSummary() {
    const box = this.el("trip-summary");
    if (!this.trip) {
      box.textContent = "No trip yet. Pick a destination and dates, then start a new trip.";
      return;
    }
    const t = this.describeTrip(this.trip);
    box.textContent = `${t.destination} · ${t.startLabel} to ${t.endLabel} · ${t.nights} night${t.nights > 1 ? "s" : ""} · ${t.travelers} traveler${t.travelers > 1 ? "s" : ""} · ${STYLE_LABELS[t.style]} style`;
  }

  renderBoard() {
    const board = this.el("board");
    const empty = this.el("board-empty");
    empty.hidden = Boolean(this.trip);
    if (!this.trip) {
      board.replaceChildren();
      return;
    }
    const dest = this.destination(this.trip.destinationId);
    const cards = this.days.map((d) => this.dayCard(d, dest));
    board.replaceChildren(...cards);
  }

  dayCard(d, dest) {
    const card = this.make("li", undefined, "day");
    const head = this.make("h3", undefined, "day-head");
    head.append(this.make("span", `Day ${d.day}`, "day-num"), this.make("span", d.label, "day-date"));
    const list = this.make("ul", undefined, "slots");
    for (const slot of SLOTS) {
      const row = this.make("li", undefined, "slot");
      row.dataset.slot = slot;
      row.append(this.make("span", SLOT_LABELS[slot], "slot-name"));
      const item = d.items.find((i) => i.slot === slot || (i.slot === "fullday" && slot !== "evening"));
      if (item && !(item.slot === "fullday" && slot === "afternoon")) {
        const chip = this.make("span", undefined, item.slot === "fullday" ? "chip chip-full" : "chip");
        chip.append(this.make("span", item.title, "chip-title"));
        if (item.costPerPerson) chip.append(this.make("span", `${formatUsd(item.costPerPerson)} pp`, "chip-cost"));
        const remove = this.make("button", "×", "chip-remove");
        remove.setAttribute("type", "button");
        remove.setAttribute("aria-label", `Remove ${item.title} from day ${d.day}`);
        remove.addEventListener("click", () => this.removeItems([item.uid]));
        chip.append(remove);
        row.append(chip);
      } else if (item) {
        row.append(this.make("span", "↑ full day", "slot-cont"));
      } else {
        row.append(this.make("span", "free", "slot-free"));
      }
      list.append(row);
    }
    card.append(head, list, this.addControls(d, dest));
    return card;
  }

  addControls(d, dest) {
    const wrap = this.make("div", undefined, "day-add");
    const select = this.make("select");
    const selectId = `add-${d.day}`;
    select.id = selectId;
    const label = this.make("label", `Add to day ${d.day}`, "visually-hidden");
    label.setAttribute("for", selectId);
    const planned = new Set(plannedItems(this.days).map((i) => i.activityId));
    select.append(this.option("Add an activity…", ""));
    for (const a of dest.activities) {
      if (!planned.has(a.id)) select.append(this.option(`${a.name} (${SLOT_LABELS[a.slot] || "Any time"}, ${formatUsd(a.costPerPerson)} pp)`, a.id));
    }
    select.addEventListener("change", () => {
      if (!select.value) return;
      const result = this.addItems([{ day: d.day, activityId: select.value }]);
      this.say(result.ok ? `Added to day ${d.day}.` : result.reason);
    });
    wrap.append(label, select);
    return wrap;
  }

  option(text, value) {
    const node = this.make("option", text);
    node.value = value;
    return node;
  }

  renderBudget() {
    const b = this.budget();
    const lines = this.el("budget-lines");
    const cap = this.el("budget-cap");
    const savings = this.el("budget-savings");
    if (!b) {
      this.el("budget-total").textContent = "—";
      this.el("budget-per-person").textContent = "Start a trip to see its budget.";
      lines.replaceChildren();
      cap.textContent = "";
      cap.dataset.status = "";
      savings.replaceChildren();
      return;
    }
    this.el("budget-total").textContent = b.display.total;
    this.el("budget-per-person").textContent = `${b.display.perPerson} per traveler · ${b.display.perDayGround} a day on the ground`;
    const max = Math.max(...b.lines.map((l) => l.high), 1);
    lines.replaceChildren(...b.lines.map((l) => {
      const row = this.make("li", undefined, "line");
      const amount = l.low === l.high ? formatUsd(l.low) : `${formatUsd(l.low)}–${formatUsd(l.high)}`;
      row.append(this.make("span", l.label, "line-label"), this.make("span", amount, "line-amount"));
      const bar = this.make("span", undefined, "line-bar");
      bar.setAttribute("aria-hidden", "true");
      const fill = this.make("span", undefined, "line-fill");
      fill.style.width = `${Math.round((l.high / max) * 100)}%`;
      bar.append(fill);
      row.append(bar, this.make("span", l.basis, "line-basis"));
      return row;
    }));
    if (b.cap) {
      cap.dataset.status = b.cap.status;
      const room = b.cap.headroom >= 0 ? `${formatUsd(b.cap.headroom)} to spare at the high end.` : `${formatUsd(-b.cap.headroom)} over at the high end.`;
      cap.textContent = `Cap ${formatUsd(b.cap.amount)}: ${CAP_WORDS[b.cap.status]} ${room}`;
    } else {
      cap.dataset.status = "";
      cap.textContent = "No budget cap set.";
    }
    const options = savingsOptions({ ...this.trip, destination: this.destination(this.trip.destinationId), planned: plannedItems(this.days) });
    savings.replaceChildren(...options.map((o) => this.make("li", `${o.change}: saves about ${o.display.saves}`)));
  }

  renderGuide() {
    const title = this.el("guide-title");
    const body = this.el("guide-body");
    const id = this.trip?.destinationId || this.el("f-destination").value || DESTINATIONS[0].id;
    const g = this.getGuide(id);
    title.textContent = `${g.name}, ${g.country}`;
    const parts = [
      this.make("p", `Best time: ${g.bestMonths}.`, "guide-best"),
      this.make("p", g.gettingAround),
      this.make("h4", "Where to stay"),
    ];
    const hoods = this.make("ul");
    hoods.append(...g.neighborhoods.map((n) => this.make("li", `${n.name}: ${n.goodFor}`)));
    const tips = this.make("ul");
    tips.append(...g.etiquette.map((e) => this.make("li", e)));
    parts.push(hoods, this.make("h4", "Good to know"), tips);
    body.replaceChildren(...parts);
  }

  fillForm() {
    const t = this.trip;
    if (!t) return;
    this.el("f-destination").value = t.destinationId;
    this.el("f-origin").value = t.originRegion;
    this.el("f-start").value = t.startDate;
    this.el("f-nights").value = String(t.nights);
    this.el("f-travelers").value = String(t.travelers);
    this.el("f-style").value = t.style;
    this.el("f-cap").value = t.budgetCap ? String(t.budgetCap) : "";
  }

  say(message) {
    this.el("page-status").textContent = message;
  }

  // ---------- the page's own form ----------

  readForm() {
    const num = (id) => {
      const raw = String(this.el(id).value ?? "").trim();
      return raw === "" ? undefined : Number(raw);
    };
    return {
      destinationId: this.el("f-destination").value,
      originRegion: this.el("f-origin").value,
      startDate: this.el("f-start").value,
      nights: num("f-nights"),
      travelers: num("f-travelers"),
      style: this.el("f-style").value,
      budgetCap: num("f-cap") ?? 0,
    };
  }

  showFormResult(result, okMessage) {
    const error = this.el("trip-form-error");
    error.textContent = result.ok ? "" : result.reason;
    this.say(result.ok ? okMessage : `Not changed: ${result.reason}`);
  }

  setupForm() {
    const fill = (id, values, labels) => {
      const select = this.el(id);
      select.replaceChildren(...values.map((v) => this.option(labels ? labels(v) : v, v)));
    };
    fill("f-destination", this.destinationIds(), (id) => {
      const d = this.destination(id);
      return `${d.name}, ${d.country}`;
    });
    fill("f-origin", ORIGIN_REGIONS);
    fill("f-style", STYLES, (s) => STYLE_LABELS[s]);
    this.el("f-style").value = "standard";
    this.el("f-start").setAttribute("min", this.today());
    this.el("f-start").setAttribute("max", addDays(this.today(), LIMITS.horizonDays));
    if (!this.el("f-start").value) this.el("f-start").value = addDays(this.today(), 30);
    this.el("f-destination").addEventListener("change", () => {
      if (!this.trip) this.renderGuide();
    });
    this.el("btn-update-trip").addEventListener("click", () => {
      const form = this.readForm();
      const patch = { ...form };
      delete patch.destinationId;
      if (this.trip && form.destinationId !== this.trip.destinationId) patch.destinationId = form.destinationId;
      this.showFormResult(this.setTripDetails(patch), "Trip details updated.");
    });
    this.el("btn-new-trip").addEventListener("click", () => {
      const args = { ...this.readForm(), expectedVersion: this.version };
      const check = this.checkNewTrip(args);
      if (check.ok && check.clears > 0 && typeof globalThis.confirm === "function"
          && !globalThis.confirm(`Start a new trip to ${check.summary.destination}? This clears ${check.clears} planned item${check.clears > 1 ? "s" : ""} and cannot be undone.`)) {
        return;
      }
      this.showFormResult(this.startNewTrip(args), "New trip started.");
    });
  }

  /**
   * A sample trip for a first visit, so the board, the budget and the agents have
   * something to work on. It is the site's own example, not anyone's booking.
   */
  seedSample() {
    const value = {
      destinationId: "lisbon", startDate: addDays(this.today(), 35), nights: 4, travelers: 2,
      style: "standard", originRegion: "North America", budgetCap: 3500,
    };
    this.trip = value;
    this.days = buildDays(value.startDate, value.nights);
    this.version = 1;
  }

  init() {
    this.load();
    if (!this.trip) this.seedSample();
    this.setupForm();
    this.render();
  }
}

export const App = {
  page: new TripDesk(globalThis.document, safeStorage()),
};
App.page.init();

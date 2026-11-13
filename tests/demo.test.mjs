// The offline demo: routing, parsing and planning, then every demo prompt through the
// real runtime with the demo model, with fetch blocked so nothing can leave the page.
import assert from "node:assert/strict";
import test from "node:test";
import { App, context, load, registry, startKnownTrip } from "./support/harness.mjs";
import { runAgent } from "../site/runtime/runner.js";
import { DESTINATIONS } from "../site/js/destinations.js";
import { buildDays, mergePlan } from "../site/js/trip-math.js";
import {
  DEMO_PROMPTS, DEMO_ROUTER, DemoModel, agentOf, findTravelers, parseNewTrip, pickActivities, routeRequest,
} from "../site/demo/demo-model.js";

const { isDemoRequested, useDemoModel } = await import("../site/site.js");
const LISBON = DESTINATIONS.find((d) => d.id === "lisbon");

test("routing: each demo prompt goes to the right agents, in order", () => {
  const routes = DEMO_PROMPTS.map((p) => routeRequest(p));
  assert.deepEqual(routes.map((r) => [r.kind, r.specialists]), [
    ["specialists", ["itinerary_planner", "budget_analyst"]],
    ["specialists", ["budget_analyst"]],
    ["specialists", ["logistics_scout"]],
    ["specialists", ["local_guide"]],
    ["new_trip", []],
    ["decline", []],
  ]);
  assert.equal(routeRequest("hello there").kind, "overview");
  assert.notEqual(routeRequest("How do I book a ferry?").kind, "decline");
});

test("routing: the system prompt tells which agent is asking", async () => {
  const loaded = await load();
  for (const agent of loaded.config.tools) {
    assert.equal(agentOf(agent.instructions), agent.name);
  }
  assert.equal(agentOf("You are someone else"), null);
});

test("parsing: a new trip from plain words, with dates relative to today", () => {
  const fields = parseNewTrip(DEMO_PROMPTS[4], "2026-11-13");
  assert.deepEqual(fields, {
    destinationId: "mexico-city", startDate: "2026-12-25", nights: 5, travelers: 3,
    style: "budget", originRegion: "North America", budgetCap: 0,
  });
  assert.equal(findTravelers("flights from Europe cost for two?"), 2);
  assert.equal(findTravelers("for 4 nights"), null);
  assert.equal(parseNewTrip("Kyoto, 2027-04-02, 3 nights, $2,500 cap", "2026-11-13").budgetCap, 2500);
});

test("planning: picks fit every slot rule, so the page places all of them", () => {
  const days = buildDays("2027-03-01", 4);
  const proposals = pickActivities(days, LISBON.activities);
  assert.ok(proposals.length >= 6);
  // First day light (evening only), last day light (morning only).
  assert.ok(proposals.filter((p) => p.day === 1).length <= 1);
  const merged = mergePlan(days, proposals, LISBON.activities, (() => { let n = 0; return () => `u${++n}`; })());
  assert.deepEqual(merged.skipped, []);
  assert.equal(merged.placed.length, proposals.length);
  // Nothing already on the board is proposed again.
  const again = pickActivities(merged.days, LISBON.activities);
  for (const p of again) assert.ok(!merged.placed.some((m) => m.activityId === p.activityId));
});

test("key handling: the demo switch reads only ?demo=1 and forgets the key in this tab", () => {
  assert.equal(isDemoRequested("https://example.org/travel/?demo=1#assistant"), true);
  assert.equal(isDemoRequested("https://example.org/travel/?demo=0"), false);
  assert.equal(isDemoRequested("https://example.org/travel/"), false);
  assert.equal(isDemoRequested("not a url"), false);
  const engine = { byokKey: "sk-saved-key", modelOverride: "gpt-x", agentRunner: () => {}, mockLLM: false, top: { llm: { baseUrl: "https://api.example/v1" } } };
  const model = useDemoModel(engine, new DemoModel({ delayMs: 0 }));
  assert.equal(engine.byokKey, "");
  assert.equal(engine.modelOverride, "");
  assert.equal(engine.agentRunner, null);
  assert.equal(engine.mockLLM, true);
  assert.equal(engine.top.llm, model);
  assert.equal(engine.userRouter.baseUrl, DEMO_ROUTER);
  assert.equal(model.apiKey, "");
});

/** Run one prompt through the real runtime with the demo model and fetch blocked. */
async function runDemo(prompt, confirm = async () => true) {
  const loaded = await load();
  const actions = await registry();
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("The offline demo must not use the network.");
  };
  try {
    const ctx = context(loaded, actions, new DemoModel({ delayMs: 0 }), confirm, { mock: true });
    const agents = [];
    ctx.trace.addEventListener("event", (e) => {
      if (e.detail.kind === "agent" && e.detail.phase === "start") agents.push(e.detail.agent);
    });
    const result = await runAgent(ctx, "front_desk", prompt, null, []);
    return { text: result.text, agents };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("demo run: planning fills the real board, then the analyst prices it", async () => {
  startKnownTrip();
  const { text, agents } = await runDemo(DEMO_PROMPTS[0]);
  assert.deepEqual(agents, ["front_desk", "itinerary_planner", "budget_analyst"]);
  const items = App.page.days.flatMap((d) => d.items);
  assert.ok(items.length >= 6, `placed ${items.length}`);
  assert.match(text, /\*\*Itinerary planner\*\*\nPlaced \d+ items/);
  assert.match(text, /\*\*Budget analyst\*\*\nTotal: \$/);
  // The analyst priced the trip after the planner filled it: activities are in the total.
  assert.ok(App.page.budget().lines.find((l) => l.key === "activities").low > 0);
  assert.match(text, /Offline demo/);
});

test("demo run: budget, flights and stays, and local tips each answer from the page's data", async () => {
  startKnownTrip();
  const budget = await runDemo(DEMO_PROMPTS[1]);
  assert.match(budget.text, /Cap \$3,500: Fits your cap only if flights come in low\./);
  assert.match(budget.text, /Travel in budget style: saves about \$690/);
  const stays = await runDemo(DEMO_PROMPTS[2]);
  assert.deepEqual(stays.agents, ["front_desk", "logistics_scout"]);
  assert.match(stays.text, /Flights to Kyoto from Europe: about \$650 to \$1,250 \(long haul\) per traveler, round trip, for 2 travelers/);
  assert.match(stays.text, /Higashiyama/);
  const tips = await runDemo(DEMO_PROMPTS[3]);
  assert.match(tips.text, /Hanoi: best time is October to December/);
  assert.match(tips.text, /cover shoulders and knees/);
});

test("demo run: a new trip goes through the confirmation; declining keeps the old trip", async () => {
  startKnownTrip();
  const before = App.page.trip.destinationId;
  const declined = await runDemo(DEMO_PROMPTS[4], async () => false);
  assert.match(declined.text, /left your current trip as it was/);
  assert.equal(App.page.trip.destinationId, before);
  let asked = null;
  const approved = await runDemo(DEMO_PROMPTS[4], async (items) => {
    asked = items;
    return true;
  });
  assert.equal(asked[0].action, "start_new_trip");
  assert.equal(asked[0].arguments.destinationId, "mexico-city");
  assert.equal(App.page.trip.destinationId, "mexico-city");
  assert.equal(App.page.trip.startDate, "2026-12-25");
  assert.match(approved.text, /New trip started:\*\* Mexico City, Mexico/);
});

test("demo run: a booking request is declined plainly, with no tool beyond reading the trip", async () => {
  startKnownTrip();
  const version = App.page.version;
  const { text, agents } = await runDemo(DEMO_PROMPTS[5]);
  assert.deepEqual(agents, ["front_desk"]);
  assert.match(text, /can't book flights or hotels/);
  assert.equal(App.page.version, version);
});

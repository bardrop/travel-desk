// Checks that the network, the manifest, the page and the runtime work together.
// The runtime is the real one in site/runtime; the model is scripted. No LLM is called.
import assert from "node:assert/strict";
import test from "node:test";
import {
  App, BASE, TODAY, context, load, readSiteJson, readSiteText, registry, run, startKnownTrip,
} from "./support/harness.mjs";
import { ScriptedModel } from "./support/scripted_model.mjs";
import { validateNetwork } from "../site/runtime/kernel.js";
import { buildToolTable, runAgent } from "../site/runtime/runner.js";

const { AssistantMount } = await import("../site/site.js");

const AGENTS = ["front_desk", "logistics_scout", "budget_analyst", "itinerary_planner", "local_guide"];

async function websiteTools(loaded, ctx, agent = "front_desk") {
  const table = await buildToolTable(ctx, loaded.network.getAgentSpec(agent), [], null);
  return [...table.toolByName.keys()].filter((n) => n.startsWith("website_")).sort();
}

test("network: the published JSON passes the runtime's validator and names five agents", async () => {
  const loaded = await load();
  const result = validateNetwork(loaded.network);
  assert.deepEqual(result.errors, []);
  assert.equal(loaded.network.findFrontMan(), "front_desk");
  assert.deepEqual(loaded.config.tools.map((t) => t.name), AGENTS);
  assert.deepEqual(loaded.network.getAgentSpec("front_desk").tools, AGENTS.slice(1));
  for (const agent of loaded.config.tools) {
    assert.deepEqual(agent.function.parameters.required, ["request"], agent.name);
  }
  // Same sample queries in both public files.
  assert.deepEqual(loaded.manifest.networks[0].sample_queries, loaded.config.metadata.sample_queries);
  assert.equal(loaded.manifest.networks[0].hocon, "./travel_desk.network.json");
  assert.equal(loaded.manifest.deployment.mode, "static");
  assert.equal(loaded.manifest.peer_policy.mode, "closed");
});

test("actions: every agentTools name is registered as a local-only action", async () => {
  const loaded = await load();
  const actions = await registry();
  const catalog = actions.catalog({ base: BASE, network: "travel_desk" });
  for (const name of loaded.manifest.actions.agentTools) {
    const entry = catalog.find((e) => e.name === name);
    assert.ok(entry, `${name} is registered`);
    assert.equal(entry.availability, "local-only", name);
  }
  const effects = Object.fromEntries(catalog.map((e) => [e.name, e.effect]));
  assert.equal(effects.start_new_trip, "irreversible");
  assert.equal(effects.add_itinerary_items, "write");
  assert.equal(effects.get_trip_state, "read");
});

test("delegation: the front desk hands a budget question to the analyst, which prices it with the page's tool", async () => {
  startKnownTrip();
  const loaded = await load();
  const actions = await registry();
  const model = new ScriptedModel([
    { tool: "budget_analyst", arguments: { request: "Price the current Lisbon trip against its cap." } },
    { tool: "website_estimate_budget", arguments: {} },
    { text: "Total $2,700 to $3,900; tight against the $3,500 cap." },
    { text: "Your trip is tight against the cap." },
  ]);
  const ctx = context(loaded, actions, model, async () => true);
  const result = await runAgent(ctx, "front_desk", "Does my trip fit the cap?", null, []);
  assert.equal(result.text, "Your trip is tight against the cap.");
  // Call 1 is the front desk, call 2 the analyst with the request as plain text.
  assert.match(model.calls[0].messages[0].content, /^You are the front desk/);
  assert.match(model.calls[1].messages[0].content, /^You are the budget analyst/);
  assert.equal(model.calls[1].messages.at(-1).content, "Price the current Lisbon trip against its cap.");
  // The analyst's tool ran on the real page.
  const [receipt] = model.toolResults(2);
  assert.equal(receipt.status, "succeeded");
  // Empty board: ground 1,400 + flights 1,300..2,500.
  assert.equal(receipt.result.estimate.total, "$2,700 to $3,900");
  assert.equal(receipt.result.estimate.cap.status, "tight");
  // The specialist's answer came back to the front desk as a tool result.
  const back = model.calls[3].messages.find((m) => m.role === "tool" && m.name === "budget_analyst");
  assert.match(back.content, /tight against the \$3,500 cap/);
});

test("read with arguments: estimate_budget prices a what-if and leaves the page as it was", async () => {
  startKnownTrip();
  const actions = await registry();
  const before = JSON.stringify(document.snapshot());
  const version = App.page.version;
  const receipt = await run(actions, "estimate_budget", { style: "budget", nights: 3 });
  assert.equal(receipt.status, "succeeded");
  // budget style, 3 nights, 2 travelers: lodging 165 + food 240 + transport 56 + misc 96 = 557,
  // flights 1,300..2,500
  assert.equal(receipt.result.estimate.groundTotal, "$557");
  assert.equal(receipt.result.estimate.total, "$1,857 to $3,057");
  assert.equal(JSON.stringify(document.snapshot()), before);
  assert.equal(App.page.version, version);
});

test("write: add_itinerary_items fills the visible board and the budget; bad ids never reach the page", async () => {
  startKnownTrip();
  const loaded = await load();
  const actions = await registry();
  const receipt = await run(actions, "add_itinerary_items", {
    items: [{ day: 2, activityId: "lisbon-sintra" }, { day: 2, activityId: "lisbon-alfama-fado" }, { day: 2, activityId: "lisbon-belem" }],
  });
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.result.ok, true);
  assert.deepEqual(receipt.result.placed.map((p) => p.slot), ["fullday", "evening"]);
  assert.match(receipt.result.skipped[0].reason, /Day 2 has no free afternoon or morning/);
  // ($40 + $45) x 2 travelers in the activities line.
  assert.equal(App.page.budget().lines.find((l) => l.key === "activities").low, 170);
  // The board shows day 2's items.
  const board = document.getElementById("board");
  assert.equal(board.children.length, 5);
  assert.match(JSON.stringify(document.snapshot().board.children[1]), /Day trip to the palaces of Sintra/);
  // An id outside the schema's enum fails validation, so nothing runs.
  const model = new ScriptedModel([
    { tool: "website_add_itinerary_items", arguments: { items: [{ day: 1, activityId: "made-up" }] } },
    { text: "done" },
  ]);
  const version = App.page.version;
  await runAgent(context(loaded, actions, model, async () => true), "front_desk", "add", null, []);
  assert.match(model.calls[1].messages.at(-1).content, /^Error from tool 'website_add_itinerary_items'/);
  assert.equal(App.page.version, version);
});

test("write: set_trip_details keeps the board and refuses to drop planned items", async () => {
  startKnownTrip();
  const actions = await registry();
  await run(actions, "add_itinerary_items", { items: [{ day: 5, activityId: "lisbon-tram-28" }] });
  const refused = await run(actions, "set_trip_details", { nights: 3 });
  assert.equal(refused.result.ok, false);
  assert.match(refused.result.reason, /remove 1 planned item on day 5/);
  assert.equal(App.page.trip.nights, 4);
  const moved = await run(actions, "set_trip_details", { startDate: "2027-01-08", travelers: 3 });
  assert.equal(moved.result.ok, true);
  assert.equal(App.page.days[4].items[0].activityId, "lisbon-tram-28");
  assert.equal(App.page.days[0].date, "2027-01-08");
  assert.equal(App.page.budget().rooms, 2);
});

test("irreversible: start_new_trip is hidden without a confirmation callback", async () => {
  const loaded = await load();
  const actions = await registry();
  const withConfirm = await websiteTools(loaded, context(loaded, actions, null, async () => true));
  const without = await websiteTools(loaded, context(loaded, actions, null, undefined));
  assert.ok(withConfirm.includes("website_start_new_trip"));
  assert.ok(!without.includes("website_start_new_trip"));
  assert.ok(without.includes("website_add_itinerary_items"));
});

test("irreversible: declining changes nothing; approving replaces the trip; a stale version is refused", async () => {
  startKnownTrip();
  const actions = await registry();
  await run(actions, "add_itinerary_items", { items: [{ day: 1, activityId: "lisbon-tram-28" }] });
  const args = {
    destinationId: "kyoto", startDate: "2027-04-01", nights: 5, travelers: 2, style: "comfort",
    originRegion: "Europe", budgetCap: 0, expectedVersion: App.page.version,
  };
  const before = JSON.stringify(App.page.getState());
  const declined = await run(actions, "start_new_trip", args, async () => false);
  assert.equal(declined.status, "cancelled");
  assert.equal(JSON.stringify(App.page.getState()), before);
  const stale = await run(actions, "start_new_trip", { ...args, expectedVersion: args.expectedVersion - 1 });
  assert.equal(stale.result.ok, false);
  assert.equal(stale.result.field, "expectedVersion");
  const newer = await run(actions, "start_new_trip", { ...args, expectedVersion: args.expectedVersion + 1 });
  assert.equal(newer.result.ok, false);
  assert.equal(JSON.stringify(App.page.getState()), before);
  const approved = await run(actions, "start_new_trip", args);
  assert.equal(approved.result.ok, true);
  assert.equal(approved.result.cleared, 1);
  assert.equal(App.page.trip.destinationId, "kyoto");
  assert.equal(App.page.days.length, 6);
  assert.ok(App.page.days.every((d) => d.items.length === 0));
});

test("dialog: the start_new_trip dialog shows the real details and refuses what the page would refuse", async () => {
  startKnownTrip();
  await run(await registry(), "add_itinerary_items", { items: [{ day: 1, activityId: "lisbon-tram-28" }, { day: 2, activityId: "lisbon-belem" }] });
  const item = {
    action: "start_new_trip", origin: BASE, effect: "irreversible",
    arguments: { destinationId: "hanoi", startDate: "2027-02-01", nights: 6, travelers: 3, style: "budget",
      originRegion: "Oceania", budgetCap: 4000, expectedVersion: App.page.version },
  };
  const content = AssistantMount.dialogContent(item);
  assert.equal(content.title, "Start a new trip?");
  assert.equal(content.confirm, "Start the new trip");
  assert.equal(content.refusal, undefined);
  assert.deepEqual(content.details, {
    "Destination": "Hanoi, Vietnam",
    "Dates": "Mon, Feb 1, 2027 to Sun, Feb 7, 2027",
    "Nights": "6",
    "Travelers": "3",
    "Style": "budget",
    "Flying from": "Oceania",
    "Budget cap": "$4,000",
    "Clears from the board": "2 planned items",
  });
  const past = AssistantMount.dialogContent({ ...item, arguments: { ...item.arguments, startDate: "2026-11-01" } });
  assert.match(past.refusal, /in the past/);
  await assert.rejects(AssistantMount.review([{ ...item, arguments: { ...item.arguments, expectedVersion: 0 } }]), /changed since it was read/);
  assert.equal(document.body.children.length, 0, "no dialog opened");
});

test("peers: another site running this network gets no website tools", async () => {
  const loaded = await load();
  const actions = await registry();
  const tools = await websiteTools(loaded, context(loaded, actions, null, async () => true, { isTop: false }));
  assert.deepEqual(tools, []);
});

test("key handling: the visitor's key never reaches a prompt, a tool argument or a tool result", async () => {
  startKnownTrip();
  const loaded = await load();
  const actions = await registry();
  const KEY = "sk-test-DO-NOT-LEAK-1234567890";
  const model = new ScriptedModel([
    { tool: "local_guide", arguments: { request: "Tips for lisbon" } },
    { tool: "website_get_destination_guide", arguments: { destinationId: "lisbon" } },
    { text: "Wear shoes with grip." },
    { tool: "website_get_trip_state", arguments: {} },
    { text: "Here are your tips." },
  ]);
  const ctx = context(loaded, actions, model, async () => true, { apiKey: KEY, mock: true, routerBaseUrl: "https://router.example/v1" });
  await runAgent(ctx, "front_desk", "Any tips?", null, []);
  const seen = JSON.stringify(model.calls);
  assert.ok(seen.length > 1000);
  assert.ok(!seen.includes(KEY));
  assert.ok(!JSON.stringify(App.page.getState()).includes(KEY));
});

test("key handling: no published file holds a key, a token or a secret", async () => {
  const files = ["agent-manifest.json", "travel_desk.network.json", "links.json", "agent-mcp.json",
    ".well-known/nsdeploy.json", ".well-known/nsdeploy-agent.json", "site-actions.js", "site.js", "index.html",
    "js/trip-desk.js", "js/trip-math.js", "js/destinations.js", "demo/demo-model.js"];
  for (const file of files) {
    const text = await readSiteText(file);
    assert.doesNotMatch(text, /\bsk-[A-Za-z0-9_-]{16,}|\bsk-ant-|\bAIza[0-9A-Za-z_-]{20,}|\bgsk_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{16,}/, file);
    assert.doesNotMatch(text, /"(api_key|apiKey|secret|password)"\s*:\s*"[^"]+"/, file);
  }
  const manifest = await readSiteJson("agent-manifest.json");
  assert.equal(manifest.llm_router.mock, false);
  assert.equal(manifest.deployment.direct_byok, true);
});

test("dates: the read action gives today and the latest start, both as YYYY-MM-DD", () => {
  const state = App.page.getState();
  assert.equal(state.today.date, TODAY);
  assert.equal(state.today.label, "Fri, Nov 13, 2026");
  assert.equal(state.options.limits.latestStart, "2027-11-13");
});

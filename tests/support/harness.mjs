// Shared set-up for tests that run the real runtime against the real page code.
// Import this module before anything from site/: it installs the DOM stand-in first.
import { readFile } from "node:fs/promises";
import { ActionRegistry } from "../../site/runtime/actions.js";
import { AgentNetwork } from "../../site/runtime/kernel.js";
import { TraceBus } from "../../site/runtime/trace.js";
import { StubDocument } from "./stub_document.mjs";
import { StubOption } from "./stub_option.mjs";

export const NETWORK_NAME = "travel_desk";
export const BASE = "http://localhost:8080";
export const TODAY = "2026-11-13";

const SITE = new URL("../../site/", import.meta.url);

globalThis.document = StubDocument.fromHtml(await readFile(new URL("index.html", SITE), "utf8"), `${BASE}/`);
globalThis.Option = StubOption;

export const { App, TripDesk } = await import("../../site/js/trip-desk.js");
// Pin today so dates in the tests mean the same thing on any day.
TripDesk.clock = () => TODAY;
export const { registerActions } = await import("../../site/site-actions.js");

export async function readSiteJson(name) {
  return JSON.parse(await readFile(new URL(name, SITE), "utf8"));
}

export async function readSiteText(name) {
  return readFile(new URL(name, SITE), "utf8");
}

export async function load() {
  const config = await readSiteJson(`${NETWORK_NAME}.network.json`);
  const manifest = await readSiteJson("agent-manifest.json");
  return { config, manifest, network: new AgentNetwork(config, NETWORK_NAME) };
}

export function scope() {
  return { base: BASE, network: NETWORK_NAME };
}

export async function registry() {
  const actions = new ActionRegistry();
  await registerActions({ register: actions.register.bind(actions, scope()) });
  return actions;
}

/** The context the engine passes to runAgent, for this site's own page. */
export function context(loaded, actions, model, confirm, extra = {}) {
  return {
    network: loaded.network,
    manifest: loaded.manifest,
    actions,
    baseOrigin: BASE,
    displayOrigin: new URL(BASE).host,
    trace: new TraceBus(),
    isTop: true,
    frontMan: loaded.network.findFrontMan(),
    history: [],
    llm: model,
    confirmWebsiteActions: confirm,
    ...extra,
  };
}

export function ref(actions, name) {
  for (const entry of actions.catalog(scope())) {
    if (entry.name === name) return entry.ref;
  }
  throw new Error(`Action ${name} is not registered.`);
}

/** Run one action directly, approving any confirmation, and return its receipt. */
export async function run(actions, name, args = {}, confirm = async () => true) {
  const plan = actions.prepare({ kind: "action", action: ref(actions, name), arguments: args });
  const receipts = await actions.execute(plan, confirm, `test-${name}`);
  // A declined confirmation gives no receipts; runner.js reports it as "cancelled".
  return receipts?.[0] || { status: "cancelled" };
}

/** A known trip, started through the page's own operation. */
export function startKnownTrip(overrides = {}) {
  return App.page.startNewTrip({
    destinationId: "lisbon", startDate: "2026-12-18", nights: 4, travelers: 2, style: "standard",
    originRegion: "North America", budgetCap: 3500, expectedVersion: App.page.version, ...overrides,
  });
}

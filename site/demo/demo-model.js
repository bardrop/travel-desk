// Travel Desk's offline demo model.
//
// A stand-in for an LLM, used only when the visitor opens the page with ?demo=1. It has
// the same chat() shape as the runtime's LlmClient, so the real runtime runs the real
// network: the front desk delegates to the real specialists, which call the page's real
// website_* tools. Only the words are scripted here, built from the tool results.
// It makes no network request and never sees an API key.
import { DESTINATIONS, ORIGIN_REGIONS } from "../js/destinations.js";

export const DEMO_MODEL_NAME = "travel-desk-offline-demo";
export const DEMO_ROUTER = "browser://travel-desk-offline-demo";

/** Prompts the demo answers well. The page shows them as buttons. */
export const DEMO_PROMPTS = [
  "Plan the days of my current trip: one big sight each morning and something fun each evening.",
  "Does my current trip fit its budget cap? What is the cheapest change that would make it fit?",
  "Where should we stay in Kyoto, and what would round-trip flights from Europe cost for two?",
  "What should I know about customs and getting around in Hanoi?",
  "Start a new trip: 5 nights in Mexico City for 3 people from North America, budget style, starting 6 weeks from today.",
  "Can you book our flights and hotel and pay for them?",
];

// The agent each system prompt belongs to, from the first line of its instructions.
const AGENT_MARKERS = [
  ["front_desk", "You are the front desk"],
  ["logistics_scout", "You are the logistics scout"],
  ["budget_analyst", "You are the budget analyst"],
  ["itinerary_planner", "You are the itinerary planner"],
  ["local_guide", "You are the local guide"],
];

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const SPECIALIST_ORDER = ["itinerary_planner", "logistics_scout", "budget_analyst", "local_guide"];

/** Which agent a system prompt belongs to, or null. */
export function agentOf(systemText) {
  const text = String(systemText || "").trimStart();
  for (const [agent, marker] of AGENT_MARKERS) {
    if (text.startsWith(marker)) return agent;
  }
  return null;
}

/**
 * Decide how the front desk handles a request: decline it, start a new trip, hand it
 * to specialists (in order), or give an overview.
 */
export function routeRequest(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(book|reserve|pay|purchase|buy)\b/.test(t) && !/\bhow (do|can|to)\b/.test(t)) return { kind: "decline", specialists: [] };
  if (/\b(start|begin|create)\b.*\btrip\b|\bnew trip\b/.test(t)) return { kind: "new_trip", specialists: [] };
  const wanted = new Set();
  if (/\b(plan|itinerary|schedule|fill|board|days)\b/.test(t)) wanted.add("itinerary_planner");
  if (/\b(flights?|fly|flying|airfare|fares?|stay|hotels?|rooms?|lodging|neighbou?rhoods?|getting there)\b/.test(t)) wanted.add("logistics_scout");
  // "cost" alone often means a flight price, so only trip-level words reach the analyst.
  if (/\b(budget|cap|cheap|cheaper|cheapest|afford|expensive|save|spend|total)\b|\bhow much\b.*\b(my|our|the|this) (current )?trip\b|\b(my|our|the|this) (current )?trip\b.*\bcost\b/.test(t)) wanted.add("budget_analyst");
  if (/\b(customs?|etiquette|tips?|know|getting around|culture|local|manners)\b/.test(t)) wanted.add("local_guide");
  // A whole plan also needs its price.
  if (wanted.has("itinerary_planner")) wanted.add("budget_analyst");
  const specialists = SPECIALIST_ORDER.filter((name) => wanted.has(name));
  return { kind: specialists.length ? "specialists" : "overview", specialists };
}

/** A destination named in the text, or null. */
export function findDestination(text) {
  const t = String(text || "").toLowerCase();
  return DESTINATIONS.find((d) => t.includes(d.name.toLowerCase()) || new RegExp(`\\b${d.id}\\b`).test(t)) || null;
}

/** The home region in "from <region>", or null. */
export function findRegion(text) {
  const t = String(text || "").toLowerCase();
  return ORIGIN_REGIONS.find((r) => t.includes(`from ${r.toLowerCase()}`)) || null;
}

function numberBefore(text, words) {
  const pattern = new RegExp(`\\b(\\d+|${Object.keys(NUMBER_WORDS).join("|")})\\s+(?:${words})\\b`, "i");
  const match = pattern.exec(text);
  if (!match) return null;
  const raw = match[1].toLowerCase();
  return NUMBER_WORDS[raw] ?? Number(raw);
}

/** Travelers in "3 people", "for two" or "2 travelers", or null. */
export function findTravelers(text) {
  const direct = numberBefore(text, "people|travelers|travellers|adults|of us|guests");
  if (direct) return direct;
  const forN = /\bfor (\d+|one|two|three|four|five|six|seven|eight)\b(?!\s+(?:nights?|days?|weeks?))/i.exec(text);
  return forN ? NUMBER_WORDS[forN[1].toLowerCase()] ?? Number(forN[1]) : null;
}

/** Fields of a new trip from plain words. Missing fields come back undefined. */
export function parseNewTrip(text, today) {
  const t = String(text || "");
  const dest = findDestination(t);
  const weeks = numberBefore(t, "weeks? from today|weeks? from now|weeks? away");
  const days = numberBefore(t, "days? from today|days? from now");
  const offset = weeks ? weeks * 7 : days || null;
  let startDate;
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t);
  if (iso) startDate = iso[1];
  else if (offset && today) startDate = shiftIso(today, offset);
  const style = /\bcomfort\b/i.test(t) ? "comfort" : /\bbudget style\b|\bon a budget\b|\bcheap\b/i.test(t) ? "budget" : /\bstandard\b/i.test(t) ? "standard" : undefined;
  const cap = /\$\s?([\d,]+)\s*(?:cap|budget|limit)?/i.exec(t);
  return {
    destinationId: dest?.id,
    startDate,
    nights: numberBefore(t, "nights?") ?? undefined,
    travelers: findTravelers(t) ?? undefined,
    style,
    originRegion: findRegion(t) ?? undefined,
    budgetCap: cap ? Number(cap[1].replace(/,/g, "")) : 0,
  };
}

function shiftIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

/**
 * Choose activities for the empty slots of a trip: the first day gets an evening, the
 * last day a morning, and the days between get a morning, an afternoon and an evening,
 * or a full-day trip and an evening. Skips activities already on the board. The page's
 * own add_itinerary_items still checks every slot.
 */
export function pickActivities(days, activities) {
  const planned = new Set(days.flatMap((d) => d.items.map((i) => i.activityId)).filter(Boolean));
  const pool = activities.filter((a) => !planned.has(a.id));
  const take = (slots) => {
    const index = pool.findIndex((a) => slots.includes(a.slot));
    return index === -1 ? null : pool.splice(index, 1)[0];
  };
  const proposals = [];
  const free = (d, slot) => !d.items.some((i) => i.slot === slot || (i.slot === "fullday" && slot !== "evening"));
  const add = (d, activity) => {
    if (activity) proposals.push({ day: d.day, activityId: activity.id });
  };
  days.forEach((d, index) => {
    const first = index === 0;
    const last = index === days.length - 1;
    if (days.length > 1 && first) {
      if (free(d, "evening")) add(d, take(["evening"]));
      return;
    }
    if (days.length > 1 && last) {
      if (free(d, "morning")) add(d, take(["morning", "any"]));
      return;
    }
    const middle = index;
    if (middle === 2 && free(d, "morning") && free(d, "afternoon")) {
      const full = take(["fullday"]);
      if (full) {
        add(d, full);
        if (free(d, "evening")) add(d, take(["evening", "any"]));
        return;
      }
    }
    if (free(d, "morning")) add(d, take(["morning", "any"]));
    if (free(d, "afternoon")) add(d, take(["afternoon", "any", "morning"]));
    if (free(d, "evening")) add(d, take(["evening", "any"]));
  });
  return proposals;
}

// ---------- reading the runtime's messages ----------

function lastUserIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return i;
  return -1;
}

/** The tool results since the last user message, by tool name, parsed when JSON. */
export function resultsSinceUser(messages) {
  const out = [];
  for (const m of messages.slice(lastUserIndex(messages) + 1)) {
    if (m.role !== "tool") continue;
    let value = m.content;
    try { value = JSON.parse(m.content); } catch { /* plain text, such as "Error from tool" */ }
    out.push({ name: m.name, value });
  }
  return out;
}

/** The result of a website_* receipt, or null when it did not succeed. */
function receiptResult(value) {
  return value && typeof value === "object" && value.status === "succeeded" ? value.result : null;
}

function lastResult(results, name) {
  for (let i = results.length - 1; i >= 0; i--) if (results[i].name === name) return results[i].value;
  return undefined;
}

// ---------- the scripted agents ----------

function call(name, args = {}) {
  return { tool: name, args };
}

function describeTripLine(trip) {
  return `Trip: ${trip.destinationId}, ${trip.startDate}, ${trip.nights} nights, ${trip.travelers} travelers, ${trip.style} style, from ${trip.originRegion}, cap ${trip.budgetCap}.`;
}

function frontDesk(userText, results) {
  const route = routeRequest(userText);
  const stateReceipt = lastResult(results, "website_get_trip_state");
  if (stateReceipt === undefined) return call("website_get_trip_state");
  const state = receiptResult(stateReceipt);
  if (!state) return say("I could not read the planner just now. Please check the page and try again.");
  const trip = state.trip;

  if (route.kind === "decline") {
    return say([
      "I can't book flights or hotels, and I can't take payments: Travel Desk plans and estimates only.",
      "",
      `What I can do: price your ${trip ? trip.destination : ""} trip, suggest where to stay, and fill your day board. When you are ready to book, use the airline's and hotel's own sites.`,
      "",
      "(Offline demo: this reply is scripted by the page.)",
    ].join("\n"));
  }

  if (route.kind === "new_trip") {
    const started = lastResult(results, "website_start_new_trip");
    if (started === undefined) {
      const fields = parseNewTrip(userText, state.today.date);
      const missing = ["destinationId", "startDate", "nights", "travelers", "style", "originRegion"].filter((k) => fields[k] === undefined);
      if (missing.length) {
        return say(`To start a new trip I still need: ${missing.join(", ")}. Please add them, or use the Trip details form on the page.\n\n(Offline demo: this reply is scripted by the page.)`);
      }
      return call("website_start_new_trip", { ...fields, expectedVersion: state.version });
    }
    if (started?.status === "cancelled") return say("No problem: I left your current trip as it was.\n\n(Offline demo: this reply is scripted by the page.)");
    const result = receiptResult(started);
    if (!result) return say(`The page did not start the trip: ${typeof started === "string" ? started : "the outcome is unknown, so please check the planner."}\n\n(Offline demo: this reply is scripted by the page.)`);
    if (!result.ok) return say(`The page refused: ${result.reason}\n\n(Offline demo: this reply is scripted by the page.)`);
    return say([
      `**New trip started:** ${result.trip.destination}, ${result.trip.startLabel} to ${result.trip.endLabel}, ${result.trip.nights} nights, ${result.trip.travelers} travelers, ${result.trip.style} style.`,
      "",
      `Planning estimate: **${result.budget.total}** (${result.budget.perPerson} per traveler).`,
      "",
      "Next step: ask me to plan the days of the trip.",
      "",
      "(Offline demo: this reply is scripted by the page.)",
    ].join("\n"));
  }

  if (route.kind === "specialists" && trip) {
    const named = findDestination(userText);
    const destinationId = named ? named.id : trip.destinationId;
    const travelers = findTravelers(userText) || trip.travelers;
    const region = findRegion(userText) || trip.originRegion;
    for (const specialist of route.specialists) {
      if (lastResult(results, specialist) === undefined) {
        const request = specialist === "itinerary_planner" || specialist === "budget_analyst"
          ? `${describeTripLine(trip)} Visitor asked: ${userText}`
          : `Destination: ${destinationId}. Home region: ${region}. Travelers: ${travelers}. Nights: ${trip.nights}. Style: ${trip.style}. Visitor asked: ${userText}`;
        return call(specialist, { request });
      }
    }
    const sections = route.specialists.map((name) => {
      const value = lastResult(results, name);
      const text = typeof value === "object" && value ? value.text : String(value || "");
      return `**${TITLES[name]}**\n${text}`;
    });
    return say([...sections, "(Offline demo: the agents and tools ran for real on this page; the wording is scripted.)"].join("\n\n"));
  }

  const summary = trip
    ? `Your trip: ${trip.destination}, ${trip.startLabel} to ${trip.endLabel}, ${trip.travelers} travelers. Planning estimate ${state.budget.total}.`
    : "There is no trip yet.";
  return say(`${summary}\n\nIn this offline demo, try a button below: plan the days, check the budget, flights and stays, local tips, or start a new trip.\n\n(Offline demo: this reply is scripted by the page.)`);
}

const TITLES = {
  itinerary_planner: "Itinerary planner",
  logistics_scout: "Logistics scout",
  budget_analyst: "Budget analyst",
  local_guide: "Local guide",
};

function destinationFromRequest(request) {
  const trip = /Trip: ([a-z-]+),/.exec(request);
  if (trip) return trip[1];
  const named = /Destination: ([a-z-]+)\./.exec(request);
  if (named) return named[1];
  return findDestination(request)?.id || null;
}

function logisticsScout(request, results) {
  const destinationId = destinationFromRequest(request);
  const guideReceipt = lastResult(results, "website_get_destination_guide");
  if (guideReceipt === undefined) return call("website_get_destination_guide", { destinationId });
  const guide = receiptResult(guideReceipt);
  if (!guide?.ok) return say("I could not read that destination's guide.");
  const region = /Home region: ([A-Za-z ]+)\./.exec(request)?.[1] || "North America";
  const travelers = Number(/Travelers: (\d+)/.exec(request)?.[1] || 2);
  const style = /Style: (\w+)/.exec(request)?.[1] || "standard";
  const band = guide.roundTripFarePerTraveler[region];
  const rooms = Math.ceil(travelers / 2);
  const hoods = guide.neighborhoods.map((n) => `- ${n.name}: ${n.goodFor}`).join("\n");
  return say([
    `Flights to ${guide.name} from ${region}: about ${band} per traveler, round trip, for ${travelers} traveler${travelers > 1 ? "s" : ""}.`,
    `Rooms: ${rooms} (two travelers share). ${style[0].toUpperCase()}${style.slice(1)} lodging is about ${guide.costBands[style].lodgingPerRoomNight} per room night.`,
    `Where to stay:\n${hoods}`,
    "These are planning bands; check real fares and rooms on airline and hotel sites.",
  ].join("\n"));
}

function budgetAnalyst(request, results) {
  const estimateReceipt = lastResult(results, "website_estimate_budget");
  if (estimateReceipt === undefined) return call("website_estimate_budget", {});
  const r = receiptResult(estimateReceipt);
  if (!r?.ok) return say(`I could not price the trip: ${r?.reason || "no result"}.`);
  const e = r.estimate;
  const top = e.lines.slice(0, 3).map((l) => `- ${l.label}: ${l.amount} (${l.basis})`).join("\n");
  const capLine = e.cap ? `Cap ${e.cap.amount}: ${e.cap.meaning}` : "No cap is set.";
  const options = r.cheaperOptions.length
    ? `Cheaper options:\n${r.cheaperOptions.map((o) => `- ${o.change}: saves about ${o.saves} (new total ${o.newTotal})`).join("\n")}`
    : "There is no cheaper style to switch to.";
  return say([`Total: ${e.total} (${e.perPerson} per traveler).`, `Biggest lines:\n${top}`, capLine, options].join("\n"));
}

function itineraryPlanner(request, results) {
  const stateReceipt = lastResult(results, "website_get_trip_state");
  const guideReceipt = lastResult(results, "website_get_destination_guide");
  if (stateReceipt === undefined || guideReceipt === undefined) {
    return { toolCalls: [call("website_get_trip_state"), call("website_get_destination_guide", { destinationId: destinationFromRequest(request) })] };
  }
  const addReceipt = lastResult(results, "website_add_itinerary_items");
  if (addReceipt === undefined) {
    const state = receiptResult(stateReceipt);
    const guide = receiptResult(guideReceipt);
    if (!state?.trip || !guide?.ok) return say("I could not read the trip or its guide.");
    const proposals = pickActivities(state.days, guide.activities);
    if (!proposals.length) return say("The board has no free slots left for new activities from the guide.");
    return call("website_add_itinerary_items", { items: proposals });
  }
  const result = receiptResult(addReceipt);
  if (!result) return say("Adding items had an unknown outcome. Please check the board.");
  if (!result.ok) return say(`Nothing was added: ${result.reason}`);
  const placed = result.placed.map((p) => `- Day ${p.day}, ${p.slot === "fullday" ? "full day" : p.slot}: ${p.title}`).join("\n");
  const skipped = result.skipped.length ? `\nSkipped:\n${result.skipped.map((s) => `- Day ${s.day}: ${s.reason}`).join("\n")}` : "";
  return say(`Placed ${result.placed.length} items on the board:\n${placed}${skipped}`);
}

function localGuide(request, results) {
  const destinationId = destinationFromRequest(request);
  const guideReceipt = lastResult(results, "website_get_destination_guide");
  if (guideReceipt === undefined) return call("website_get_destination_guide", { destinationId });
  const g = receiptResult(guideReceipt);
  if (!g?.ok) return say("I could not read that destination's guide.");
  return say([
    `${g.name}: best time is ${g.bestMonths}.`,
    `Getting around: ${g.gettingAround}`,
    `Customs:\n${g.etiquette.map((e) => `- ${e}`).join("\n")}`,
    "Visas and safety alerts are not in the guide: check official sources.",
  ].join("\n"));
}

function say(text) {
  return { text };
}

const SCRIPTS = {
  front_desk: frontDesk,
  logistics_scout: logisticsScout,
  budget_analyst: budgetAnalyst,
  itinerary_planner: itineraryPlanner,
  local_guide: localGuide,
};

let callSeq = 0;

/**
 * The demo model. Pass it as the runtime's LLM client. delayMs paces the streamed
 * words so the agent map and the chat are easy to follow; tests pass 0.
 */
export class DemoModel {
  constructor({ delayMs = 18 } = {}) {
    this.baseUrl = DEMO_ROUTER;
    this.apiKey = "";
    this.mock = true;
    this.delayMs = delayMs;
  }

  async chat({ messages = [], tools = [], onContentDelta, signal } = {}) {
    signal?.throwIfAborted?.();
    const agent = agentOf(messages[0]?.content);
    const userIndex = lastUserIndex(messages);
    const userText = userIndex >= 0 ? String(messages[userIndex].content || "") : "";
    const results = resultsSinceUser(messages);
    const script = SCRIPTS[agent];
    const step = script ? script(userText, results) : say("This offline demo only scripts the Travel Desk agents.");
    const offered = new Set(tools.map((t) => t.function?.name));
    const calls = step.toolCalls || (step.tool ? [step] : []);
    if (calls.length) {
      for (const c of calls) {
        if (!offered.has(c.tool)) return this.finish(`The demo wanted ${c.tool}, which this agent is not offered.`, onContentDelta);
      }
      await this.pause();
      return {
        content: "",
        toolCalls: calls.map((c) => ({ id: `demo_${++callSeq}`, type: "function",
          function: { name: c.tool, arguments: JSON.stringify(c.args || {}) } })),
        finishReason: "tool_calls",
        usage: null,
        model: DEMO_MODEL_NAME,
      };
    }
    return this.finish(step.text, onContentDelta);
  }

  async finish(text, onContentDelta) {
    if (onContentDelta) {
      for (const piece of text.match(/\S+\s*/g) || []) {
        onContentDelta(piece);
        if (this.delayMs) await this.pause(this.delayMs / 3);
      }
    }
    return { content: text, toolCalls: [], finishReason: "stop", usage: null, model: DEMO_MODEL_NAME };
  }

  pause(ms = this.delayMs * 12) {
    return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  }
}

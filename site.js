// Mounts the Travel Desk agents inside the page, from the agentify-website template.
// Adds three things of this site's own: the confirmation dialog's details for
// start_new_trip, the live agent map in the hero, and the clearly labeled offline demo.
import { App } from "./js/trip-desk.js";
import { DEMO_PROMPTS, DEMO_ROUTER, DemoModel } from "./demo/demo-model.js";

/** True when the page address asks for the offline demo (?demo=1). */
export function isDemoRequested(href) {
  try {
    return new URL(href).searchParams.get("demo") === "1";
  } catch {
    return false;
  }
}

/**
 * Switch a booted engine to the offline demo model. The key, router and model the
 * visitor may have saved are left untouched in storage, and the engine forgets the
 * key for this tab, so nothing can reach a provider while the demo runs.
 */
export function useDemoModel(engine, model = new DemoModel()) {
  engine.byokKey = "";
  engine.modelOverride = "";
  engine.agentRunner = null;
  engine.mockLLM = true;
  engine.top.llm = model;
  engine.userRouter = { baseUrl: DEMO_ROUTER, mock: true };
  return model;
}

export class AssistantMount {
  static GREETING = "Hi, I'm the front desk. I can plan your days, check flights and stays, price the trip against your cap, and share local tips. I work on the planner above.";

  static DEMO_GREETING = "Offline demo: I'm the front desk, with scripted words but real agents and tools. Pick a prompt above, or type your own.";

  static DIALOGS = {
    start_new_trip: {
      title: "Start a new trip?",
      sentence: "This replaces your trip and clears every item on the day board. It cannot be undone.",
      confirm: "Start the new trip",
      decline: "Keep my current trip",
    },
  };

  static AGENT_NAMES = ["front_desk", "logistics_scout", "budget_analyst", "itinerary_planner", "local_guide"];

  static async start() {
    const status = document.querySelector("#assistant-status");
    const siteBase = new URL("./", import.meta.url).href;
    const demo = isDemoRequested(document.URL);
    try {
      const { boot } = await import("./runtime/index.js");
      const booted = await boot("#agent-app", {
        originUrl: siteBase,
        sandboxWorkerUrl: new URL("runtime/sandbox-worker.js", siteBase).href,
      });
      AssistantMount.engine = booted.engine;
      AssistantMount.defaultReview = booted.engine.onActionConfirm;
      booted.engine.onActionConfirm = AssistantMount.review;
      AssistantMount.defaultConsent = booted.engine.onConsent;
      booted.engine.onConsent = AssistantMount.consent;
      AssistantMount.watchAgents(booted.trace);
      AssistantMount.showNetworkUrl(siteBase);
      if (demo) {
        useDemoModel(booted.engine);
        AssistantMount.showDemo();
        status.textContent = "Offline demo running. No AI key is used and nothing leaves your browser.";
        AssistantMount.greet(AssistantMount.DEMO_GREETING);
        return booted.engine;
      }
      const needsKey = !booted.engine.mockLLM
        && (!booted.engine.byokKey || booted.engine.byokKey === "demo");
      status.textContent = needsKey
        ? "The agents need your AI provider key. Add it in AI model settings below, or try the offline demo."
        : "Agents connected to this page.";
      if (!needsKey) {
        AssistantMount.greet(AssistantMount.GREETING);
      }
      return booted.engine;
    } catch (error) {
      status.textContent = "The agents could not load. You can still use the planner directly.";
      console.error("Assistant startup failed", error);
      return null;
    }
  }

  /** Show the demo banner and the prompt buttons, and hide the runtime's key badge. */
  static showDemo() {
    document.body.dataset.demo = "on";
    document.querySelector("#demo-banner").hidden = false;
    document.querySelector("#demo-offer").hidden = true;
    const list = document.querySelector("#demo-prompt-list");
    for (const prompt of DEMO_PROMPTS) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "prompt";
      button.textContent = prompt;
      button.addEventListener("click", () => AssistantMount.ask(prompt));
      item.append(button);
      list.append(item);
    }
    document.querySelector("#demo-prompts").hidden = false;
    // Empty the settings fields on screen (saved setups stay in storage), so the
    // settings panel cannot look up models with a saved key during the demo.
    for (const id of ["#ns-key", "#ns-model", "#ns-router"]) {
      const field = document.querySelector(id);
      if (field) field.value = "";
    }
    const settings = document.querySelector("#agent-app .ns-settings");
    if (settings) settings.open = false;
  }

  /** Put a prompt in the chat box and send it, as if the visitor typed it. */
  static ask(prompt) {
    const input = document.querySelector("#ns-input");
    const send = document.querySelector("#ns-send");
    if (!input || !send) return;
    input.value = prompt;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    send.click();
  }

  /** Light up each agent's box in the hero map while it works. */
  static watchAgents(trace) {
    const running = new Map();
    trace.addEventListener("event", (event) => {
      const ev = event.detail;
      if (ev.kind !== "agent" || !AssistantMount.AGENT_NAMES.includes(ev.agent)) return;
      const node = document.getElementById(`node-${ev.agent}`);
      if (!node) return;
      const count = (running.get(ev.agent) || 0) + (ev.phase === "start" ? 1 : ev.phase === "end" ? -1 : 0);
      running.set(ev.agent, Math.max(0, count));
      if (count > 0) {
        node.dataset.state = "active";
      } else if (ev.phase === "end") {
        node.dataset.state = ev.status === "error" ? "error" : "done";
      }
    });
  }

  /** Show this network's public URL, which other agentic websites call. */
  static showNetworkUrl(siteBase) {
    const target = document.querySelector("#network-url");
    if (target) target.textContent = `${siteBase.replace(/\/$/, "")}/travel_desk`;
  }

  static greet(text) {
    const first = document.querySelector("#ns-msgs .ns-msg.bot");
    if (first) first.textContent = text;
  }

  static async review(items) {
    let confirmed;
    const pageOrigin = new URL(document.URL).origin;
    if (items.length > 1) {
      for (const item of items) {
        if (item.origin === pageOrigin && Object.hasOwn(AssistantMount.DIALOGS, item.action)) {
          throw new Error(`Nothing ran. "${AssistantMount.DIALOGS[item.action].confirm}" needs its own confirmation, so ask the assistant to do that on its own.`);
        }
      }
    }
    const own = items.length === 1 && items[0].origin === pageOrigin;
    if (own && Object.hasOwn(AssistantMount.DIALOGS, items[0].action)) {
      const content = AssistantMount.dialogContent(items[0]);
      if (content.refusal) {
        throw new Error(content.refusal);
      }
      confirmed = await new Promise(AssistantMount.openDialog.bind(null, content));
    } else {
      confirmed = await AssistantMount.defaultReview(items);
    }
    AssistantMount.keepFocusInChat();
    return confirmed;
  }

  static async consent(info) {
    const answer = AssistantMount.defaultConsent(info);
    AssistantMount.focusConsentCard();
    const decision = await answer;
    AssistantMount.keepFocusInChat();
    return decision;
  }

  static focusConsentCard() {
    const cards = document.querySelectorAll("#ns-msgs .ns-consent");
    const card = cards[cards.length - 1];
    const title = card ? card.querySelector(".ns-consent-title") : null;
    if (!title) return;
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", title.textContent);
    const active = document.activeElement;
    if (active && active !== document.body && !active.closest("#agent-app")) return;
    title.tabIndex = -1;
    title.focus();
  }

  static dialogContent(item) {
    let details = {};
    try {
      details = AssistantMount.reviewDetails(item.action, item.arguments) || {};
    } catch (error) {
      console.error("Could not add details to the confirmation dialog", error);
    }
    const { refusal, ...shown } = details;
    return {
      ...AssistantMount.DIALOGS[item.action],
      details: shown,
      refusal,
      exact: `${item.action} on ${item.origin} (${item.effect})\n${JSON.stringify(item.arguments, null, 2)}`,
    };
  }

  /**
   * The readable details of start_new_trip, from the page's own read-only check, so
   * the dialog never offers a button the page would refuse.
   */
  static reviewDetails(action, args) {
    if (action !== "start_new_trip") return {};
    const check = App.page.checkNewTrip(args);
    if (!check.ok) return { refusal: check.reason };
    const t = check.summary;
    return {
      "Destination": t.destination,
      "Dates": `${t.startLabel} to ${t.endLabel}`,
      "Nights": String(t.nights),
      "Travelers": String(t.travelers),
      "Style": t.style,
      "Flying from": t.originRegion,
      "Budget cap": t.budgetCap,
      "Clears from the board": check.clears === 1 ? "1 planned item" : `${check.clears} planned items`,
    };
  }

  static openDialog(content, resolve) {
    const dialog = document.createElement("dialog");
    dialog.className = "assistant-review";
    dialog.setAttribute("aria-labelledby", "assistant-review-title");
    const heading = document.createElement("h2");
    heading.id = "assistant-review-title";
    heading.textContent = content.title;
    heading.tabIndex = -1;
    heading.autofocus = true;
    const sentence = document.createElement("p");
    sentence.textContent = content.sentence;
    dialog.append(heading, sentence);
    const exact = document.createElement("details");
    const exactLabel = document.createElement("summary");
    exactLabel.textContent = "Technical details";
    const exactText = document.createElement("pre");
    exactText.textContent = content.exact;
    exact.append(exactLabel, exactText);
    const entries = Object.entries(content.details);
    if (entries.length) {
      const list = document.createElement("dl");
      for (const [label, value] of entries) {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = String(value);
        list.append(term, description);
      }
      dialog.append(list);
    } else {
      exact.open = true;
    }
    const confirmButton = document.createElement("button");
    confirmButton.textContent = content.confirm;
    confirmButton.addEventListener("click", dialog.close.bind(dialog, "confirm"));
    const declineButton = document.createElement("button");
    declineButton.className = "assistant-decline";
    declineButton.textContent = content.decline;
    declineButton.addEventListener("click", dialog.close.bind(dialog, "decline"));
    dialog.addEventListener("close", AssistantMount.finishDialog.bind(null, dialog, resolve));
    dialog.append(exact, confirmButton, declineButton);
    document.body.append(dialog);
    dialog.showModal();
  }

  static finishDialog(dialog, resolve) {
    dialog.remove();
    resolve(dialog.returnValue === "confirm");
  }

  static keepFocusInChat() {
    if (document.activeElement === document.body || document.activeElement === null) {
      document.querySelector("#ns-input")?.focus();
    }
  }
}

// Boot only in a browser. Node tests import this file to check the dialog's words.
if (typeof window !== "undefined") {
  await AssistantMount.start();
}

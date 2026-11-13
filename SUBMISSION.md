# Devpost submission text

Replace `bardrop` and the YouTube link before you paste.

**Project name:** Travel Desk

**Tagline (short):** Five AI travel agents that plan your trip in your own browser, on your own key. An open agentic website.

**Website URL:** https://bardrop.github.io/travel-desk/

**Offline demo (no key):** https://bardrop.github.io/travel-desk/?demo=1

**Code:** https://github.com/bardrop/travel-desk

**Video:** https://www.youtube.com/watch?v=YOUR_VIDEO_ID

**Screenshots:** upload the three files in `docs/screenshots/` (hero and agent map, planner with board and budget, agents chat).

---

## Inspiration

Planning a trip means ten tabs: fares, hotels, maps, blogs and a budget sheet. AI travel assistants help, but they live inside closed apps, run on the vendor's model, and keep your data. We wanted to show the open version: a travel team that is public data, runs in the visitor's browser on the visitor's own key, works directly on the website, and can be called by other websites.

## What it does

Travel Desk is a trip planner with a team of five agents:

- **Front desk**: talks to you and hands out the work.
- **Logistics scout**: round-trip fare bands from your home region, rooms needed, lodging band, and where to stay.
- **Budget analyst**: prices the trip and what-ifs, checks your cap, and finds the cheapest change that helps.
- **Itinerary planner**: fills the day-by-day board on the page, respecting morning, afternoon, evening and full-day slots.
- **Local guide**: customs, getting around and the best time to go.

The agents use the page's own functions as tools, so their work appears on the planner at once: the day board fills, the budget bars move, and the cap box turns green, amber or red. A live agent map lights up each agent while it works. Starting a new trip clears the board, so the page asks you first in a dialog that shows exactly what will change.

The planner also works fully by hand, without any AI.

No AI key? The **offline demo** (`?demo=1`) is clearly labeled. The words are scripted by the page, but the real network, the real runtime, the real tools and the real planner all run, and nothing leaves the browser.

## How we built it

- **Spec first.** We followed the open agentic web MVP spec (Profile 0.2) and its agentify-website skill. The network is written in HOCON and built to `travel_desk.network.json` with the spec repo's own builder, which also runs the runtime's validator. The manifest names the network, the front agent and the JSON file. `links.json`, the action bridge and the `.well-known` discovery files are published too.
- **Runtime.** The spec repo's browser runtime, copied unchanged. It runs every agent, the delegation and the tool calls in the tab. BYOK settings keep the key in the browser and send it only to the chosen provider.
- **Site actions.** Seven `website_*` tools wrap one page object (`App.page`), the same one the page's buttons use, so people and agents follow the same rules: read the trip, read a destination guide, price a what-if, change details, add and remove board items, and start a new trip (irreversible, confirmed, version-checked).
- **Plain web tech.** HTML, CSS and JavaScript modules. No framework, no build step for the site, no third-party scripts, no web fonts. Static hosting on GitHub Pages, published by a GitHub Actions workflow that runs the checks first.
- **Tests.** 38 Node tests with no browser and no LLM: budget math checked by hand, itinerary merging rules, input limits, the network against the runtime's validator, delegation through the real runtime with a scripted model, confirmation and refusal paths, peers getting no site tools, the key never reaching prompts or tool arguments, and every demo prompt end to end with the network blocked.

## Challenges we ran into

- **Honest numbers.** A static site has no live fares. We made the site's own planning bands the single source of truth, label them everywhere as estimates, and tell the agents never to invent prices.
- **Model cost.** Every delegation costs the visitor model calls. We kept specialists to jobs with their own knowledge or workflow, and the front desk only calls the ones a request needs.
- **Safe writes.** Board changes run at once and are easy to undo; starting a new trip is irreversible, so it needs the visitor's confirmation and a fresh version number.
- **A demo without a key.** Judges may not have a key. The demo model plugs into the real runtime, so the demo shows real delegation and real tool calls, not a video.

## Accomplishments that we're proud of

- A complete product, not a proof of concept: it is useful by hand and better with agents.
- The agent team is fully public and portable: one JSON file other sites can call.
- The visitor stays in control: their model, their key, and a clear dialog before anything that cannot be undone.

## What we learned

The open agentic web pattern works on plain static hosting. The interesting design work is in the tools: when the site's own functions are the agents' tools, agents and people share one set of rules.

## What's next

- Link to partner agentic websites (guesthouses, tour operators) so the desk can ask them, with the visitor's consent.
- More destinations, and community-contributed guide data.
- A "share my plan" export other agents can read.
- List the site in the agentic websites directory and the NANDA Index.

## Built with

HTML, CSS, JavaScript (ES modules), the open agentic web runtime (nsdeploy-based), HOCON / JSON, Node.js test runner, ESLint, GitHub Pages, GitHub Actions. Default LLM router: hosted Otari (any OpenAI-compatible provider works).

## New project

Travel Desk was created from scratch during the submission period (repository history starts in November 2026).

## Otari (fill in only if you used Otari while building or testing)

- Otari account email: `YOUR_OTARI_EMAIL`
- A problem we faced and how Otari could improve: `WRITE ONE OR TWO SENTENCES FROM YOUR OWN TESTING`

// Registers Travel Desk's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Each name in
// "actions.agentTools" becomes a model tool called website_<name>.
//
// Every action wraps a method of App.page (js/trip-desk.js), the same methods the
// page's own form and board use. No business rule lives here. Operations refuse bad
// input by returning {ok: false, reason}; a thrown error is reported as "unknown".
import { ORIGIN_REGIONS } from "./js/destinations.js";
import { App } from "./js/trip-desk.js";
import { LIMITS, STYLES } from "./js/trip-math.js";

const EMPTY = { type: "object", properties: {}, additionalProperties: false };

/** The trip fields shared by estimate_budget, set_trip_details and start_new_trip. */
function tripFields() {
  return {
    destinationId: { type: "string", enum: App.page.destinationIds(), description: "Destination id from website_get_trip_state options." },
    startDate: { type: "string", format: "date", description: "First day, YYYY-MM-DD, on or after today." },
    nights: { type: "integer", minimum: LIMITS.minNights, maximum: LIMITS.maxNights, description: "Number of nights." },
    travelers: { type: "integer", minimum: LIMITS.minTravelers, maximum: LIMITS.maxTravelers, description: "Number of travelers." },
    style: { type: "string", enum: STYLES, description: "budget, standard or comfort." },
    originRegion: { type: "string", enum: ORIGIN_REGIONS, description: "The region the travelers fly from." },
    budgetCap: { type: "integer", minimum: 0, maximum: LIMITS.maxBudgetCap, description: "Total cap in whole US dollars; 0 for none." },
  };
}

class SiteActions {
  static registerActions(actions) {
    for (const definition of SiteActions.definitions()) actions.register(definition);
  }

  static definitions() {
    const fields = tripFields();
    const { startDate: _start, ...estimateFields } = fields;
    return [
      {
        name: "get_trip_state",
        description: "Read the planner: today's date, the trip (destination, dates, nights, travelers, style, home region, cap), its version, the day board with item uids, the budget estimate, the destination list and what the site cannot do.",
        effect: "read",
        inputSchema: EMPTY,
        execute: () => App.page.getState(),
      },
      {
        name: "get_destination_guide",
        description: "Read one destination's guide: best months, getting around, neighborhoods to stay in, etiquette, activities with ids, slots, hours and cost per person, cost bands per style and round-trip fare bands from each home region. Changes nothing.",
        effect: "read",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["destinationId"],
          properties: { destinationId: fields.destinationId },
        },
        execute: (args) => App.page.getGuide(args.destinationId),
      },
      {
        name: "estimate_budget",
        description: "Price a what-if trip without changing the page. Values left out come from the current trip. Returns each cost line with its basis, totals, per-traveler range, cap status and cheaper options. Planned activities count only for the current destination.",
        effect: "read",
        inputSchema: { type: "object", additionalProperties: false, properties: estimateFields },
        execute: (args) => App.page.estimate(args),
      },
      {
        name: "set_trip_details",
        description: "Change the current trip's start date, nights, travelers, style, home region or cap. Keeps the day board; refuses a change that would drop planned items. Cannot change the destination: use website_start_new_trip.",
        effect: "write",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: (({ destinationId: _d, ...rest }) => rest)(fields),
        },
        execute: (args) => App.page.setTripDetails(args),
      },
      {
        name: "add_itinerary_items",
        description: "Add activities (by id from website_get_destination_guide) or short notes to days of the current trip. Each item goes in its slot, or the next free slot it allows. Returns placed items with uids and skipped items with reasons.",
        effect: "write",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["items"],
          properties: {
            items: {
              type: "array",
              minItems: 1,
              maxItems: 30,
              description: "Items to add.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["day"],
                properties: {
                  day: { type: "integer", minimum: 1, maximum: LIMITS.maxNights + 1, description: "Day number, starting at 1." },
                  activityId: { type: "string", enum: App.page.activityIds(), description: "An activity id from the guide. Leave out for a note." },
                  title: { type: "string", minLength: 1, maxLength: LIMITS.maxTitle, description: "A short note instead of an activity, such as Free afternoon." },
                  slot: { type: "string", enum: ["morning", "afternoon", "evening", "fullday"], description: "Optional slot; the activity's own slot is used when left out." },
                },
              },
            },
          },
        },
        execute: (args) => App.page.addItems(args.items),
      },
      {
        name: "remove_itinerary_items",
        description: "Remove items from the day board by their uids from website_get_trip_state.",
        effect: "write",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["uids"],
          properties: {
            uids: { type: "array", minItems: 1, maxItems: 45, items: { type: "string", minLength: 1, maxLength: 20 }, description: "Item uids." },
          },
        },
        execute: (args) => App.page.removeItems(args.uids),
      },
      {
        name: "start_new_trip",
        description: "Start a new trip: sets every trip field and clears the whole day board. Cannot be undone, so the browser asks the visitor first. Refuses a stale expectedVersion.",
        effect: "irreversible",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["destinationId", "startDate", "nights", "travelers", "style", "originRegion", "expectedVersion"],
          properties: {
            ...fields,
            expectedVersion: { type: "integer", minimum: 0, description: "The version from website_get_trip_state in this turn." },
          },
        },
        execute: (args) => App.page.startNewTrip(args),
      },
    ];
  }
}

export const registerActions = SiteActions.registerActions;

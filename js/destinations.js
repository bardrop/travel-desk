// Travel Desk's own destination guide. This is the site's data: the agents read it
// through website_* tools and never copy it into their instructions.
//
// All amounts are rough planning bands in US dollars, compiled for this site in 2026.
// They are not live prices or quotes. The page says so next to every total.
//
// costs[style]: lodging per room per night (2 travelers share a room), food, local
// transport, and unplanned spending per traveler per day.
// activities[].slot: "morning", "afternoon", "evening", "any" or "fullday" (a full day
// takes the morning and the afternoon).

export const ORIGIN_REGIONS = [
  "North America",
  "Latin America",
  "Europe",
  "Africa",
  "Middle East",
  "South Asia",
  "East Asia",
  "Southeast Asia",
  "Oceania",
];

// Round-trip economy fare band per traveler, by distance tier between two regions.
export const FARE_TIERS = [
  { tier: 0, label: "same region", low: 90, high: 320 },
  { tier: 1, label: "nearby region", low: 280, high: 700 },
  { tier: 2, label: "long haul", low: 650, high: 1250 },
  { tier: 3, label: "very long haul", low: 950, high: 1800 },
];

// Distance tier between two regions. The table is symmetric; see fareTier() in
// trip-math.js, which reads it in both directions.
export const REGION_TIERS = {
  "North America": { "North America": 0, "Latin America": 1, Europe: 2, Africa: 3, "Middle East": 3, "South Asia": 3, "East Asia": 2, "Southeast Asia": 3, Oceania: 3 },
  "Latin America": { "Latin America": 0, Europe: 2, Africa: 3, "Middle East": 3, "South Asia": 3, "East Asia": 3, "Southeast Asia": 3, Oceania: 3 },
  Europe: { Europe: 0, Africa: 1, "Middle East": 1, "South Asia": 2, "East Asia": 2, "Southeast Asia": 2, Oceania: 3 },
  Africa: { Africa: 0, "Middle East": 1, "South Asia": 2, "East Asia": 3, "Southeast Asia": 3, Oceania: 3 },
  "Middle East": { "Middle East": 0, "South Asia": 1, "East Asia": 2, "Southeast Asia": 2, Oceania: 3 },
  "South Asia": { "South Asia": 0, "East Asia": 1, "Southeast Asia": 1, Oceania: 2 },
  "East Asia": { "East Asia": 0, "Southeast Asia": 1, Oceania: 2 },
  "Southeast Asia": { "Southeast Asia": 0, Oceania: 1 },
  Oceania: { Oceania: 0 },
};

export const DESTINATIONS = [
  {
    id: "lisbon",
    name: "Lisbon",
    country: "Portugal",
    region: "Europe",
    bestMonths: "March to May, and September to October",
    costs: {
      budget: { lodging: 55, food: 30, transport: 7, misc: 12 },
      standard: { lodging: 120, food: 55, transport: 12, misc: 25 },
      comfort: { lodging: 260, food: 95, transport: 28, misc: 45 },
    },
    gettingAround: "Walk the old town, ride the metro and trams with a rechargeable transit card, and expect steep hills.",
    neighborhoods: [
      { name: "Baixa and Chiado", goodFor: "first visit, central, easy transit" },
      { name: "Alfama", goodFor: "old streets, viewpoints, live fado" },
      { name: "Príncipe Real", goodFor: "quiet, cafés, gardens" },
    ],
    etiquette: [
      "Lunch often runs from 1 pm; dinner starts late, around 8 pm.",
      "Bread and olives put on the table may be charged if you eat them.",
      "Wear shoes with grip: the stone pavements get slippery.",
    ],
    activities: [
      { id: "lisbon-tram-28", name: "Ride tram 28 through the old town", slot: "morning", hours: 2, costPerPerson: 4 },
      { id: "lisbon-belem", name: "Belém: the tower, the monastery and custard tarts", slot: "afternoon", hours: 4, costPerPerson: 22 },
      { id: "lisbon-alfama-fado", name: "Dinner with live fado in Alfama", slot: "evening", hours: 3, costPerPerson: 45 },
      { id: "lisbon-sintra", name: "Day trip to the palaces of Sintra", slot: "fullday", hours: 8, costPerPerson: 40 },
      { id: "lisbon-lx-factory", name: "Shops and food at LX Factory", slot: "any", hours: 2, costPerPerson: 15 },
      { id: "lisbon-miradouros", name: "Sunset at the city viewpoints", slot: "evening", hours: 2, costPerPerson: 0 },
    ],
  },
  {
    id: "kyoto",
    name: "Kyoto",
    country: "Japan",
    region: "East Asia",
    bestMonths: "late March to April, and October to November",
    costs: {
      budget: { lodging: 70, food: 30, transport: 8, misc: 12 },
      standard: { lodging: 160, food: 60, transport: 12, misc: 25 },
      comfort: { lodging: 380, food: 110, transport: 30, misc: 50 },
    },
    gettingAround: "City buses and two subway lines cover most sights; a rechargeable IC card works on both. Many temples are best reached on foot or by bike.",
    neighborhoods: [
      { name: "Downtown (Kawaramachi)", goodFor: "food, shopping, transit hub" },
      { name: "Higashiyama", goodFor: "temples, old wooden streets" },
      { name: "Near Kyoto Station", goodFor: "day trips and late arrivals" },
    ],
    etiquette: [
      "Tipping is not expected.",
      "Take off your shoes where you see a step up or a shoe rack.",
      "Ask before taking photos of people, especially in Gion.",
    ],
    activities: [
      { id: "kyoto-fushimi-inari", name: "Walk the torii gates of Fushimi Inari", slot: "morning", hours: 3, costPerPerson: 0 },
      { id: "kyoto-arashiyama", name: "Arashiyama bamboo grove and river", slot: "morning", hours: 4, costPerPerson: 10 },
      { id: "kyoto-kiyomizu", name: "Kiyomizu-dera and the Higashiyama lanes", slot: "afternoon", hours: 3, costPerPerson: 3 },
      { id: "kyoto-nishiki", name: "Taste your way through Nishiki Market", slot: "any", hours: 2, costPerPerson: 20 },
      { id: "kyoto-tea-ceremony", name: "Tea ceremony class", slot: "afternoon", hours: 1.5, costPerPerson: 35 },
      { id: "kyoto-nara", name: "Day trip to Nara's temples and deer park", slot: "fullday", hours: 8, costPerPerson: 25 },
      { id: "kyoto-gion-evening", name: "Evening walk in Gion and Pontocho", slot: "evening", hours: 2, costPerPerson: 0 },
    ],
  },
  {
    id: "mexico-city",
    name: "Mexico City",
    country: "Mexico",
    region: "Latin America",
    bestMonths: "October to April (the dry season)",
    costs: {
      budget: { lodging: 40, food: 20, transport: 4, misc: 10 },
      standard: { lodging: 95, food: 40, transport: 10, misc: 20 },
      comfort: { lodging: 230, food: 80, transport: 25, misc: 40 },
    },
    gettingAround: "The metro is cheap and wide-reaching; app taxis are common for evenings. The city is high (2,240 m), so take the first day slowly.",
    neighborhoods: [
      { name: "Roma Norte", goodFor: "food, cafés, walkable streets" },
      { name: "Condesa", goodFor: "parks, quieter evenings" },
      { name: "Centro Histórico", goodFor: "museums and landmarks close by" },
    ],
    etiquette: [
      "Tip about 10 to 15 percent in restaurants.",
      "Drink bottled or filtered water.",
      "Many museums close on Mondays.",
    ],
    activities: [
      { id: "cdmx-anthropology", name: "National Museum of Anthropology", slot: "morning", hours: 3, costPerPerson: 6 },
      { id: "cdmx-teotihuacan", name: "Day trip to the pyramids of Teotihuacan", slot: "fullday", hours: 8, costPerPerson: 35 },
      { id: "cdmx-xochimilco", name: "Boat ride on the canals of Xochimilco", slot: "afternoon", hours: 3, costPerPerson: 25 },
      { id: "cdmx-centro-walk", name: "Walk the Zócalo and the historic center", slot: "any", hours: 3, costPerPerson: 0 },
      { id: "cdmx-taco-tour", name: "Street-food tour in Roma", slot: "evening", hours: 3, costPerPerson: 40 },
      { id: "cdmx-coyoacan", name: "Coyoacán streets and Frida Kahlo museum", slot: "afternoon", hours: 4, costPerPerson: 18 },
    ],
  },
  {
    id: "cape-town",
    name: "Cape Town",
    country: "South Africa",
    region: "Africa",
    bestMonths: "November to March",
    costs: {
      budget: { lodging: 45, food: 22, transport: 10, misc: 12 },
      standard: { lodging: 110, food: 45, transport: 20, misc: 25 },
      comfort: { lodging: 280, food: 85, transport: 45, misc: 45 },
    },
    gettingAround: "App taxis or a rental car are the usual choice; the MyCiTi bus covers some routes. Avoid walking alone after dark in quiet areas.",
    neighborhoods: [
      { name: "V&A Waterfront", goodFor: "easy first stay, restaurants" },
      { name: "Sea Point", goodFor: "seaside promenade, mid-range stays" },
      { name: "Gardens", goodFor: "close to Table Mountain and the city center" },
    ],
    etiquette: [
      "Tip about 10 to 15 percent in restaurants.",
      "Car guards who watch parked cars expect a small tip.",
      "Wind can close the Table Mountain cableway; keep a spare day.",
    ],
    activities: [
      { id: "cpt-table-mountain", name: "Table Mountain by cableway or hike", slot: "morning", hours: 4, costPerPerson: 25 },
      { id: "cpt-cape-point", name: "Cape Peninsula and Boulders penguin beach", slot: "fullday", hours: 9, costPerPerson: 45 },
      { id: "cpt-robben-island", name: "Robben Island tour", slot: "morning", hours: 4, costPerPerson: 30 },
      { id: "cpt-bo-kaap", name: "Bo-Kaap streets and a Cape Malay cooking class", slot: "afternoon", hours: 3, costPerPerson: 40 },
      { id: "cpt-kirstenbosch", name: "Kirstenbosch botanical garden", slot: "any", hours: 3, costPerPerson: 12 },
      { id: "cpt-signal-hill", name: "Sunset from Signal Hill", slot: "evening", hours: 2, costPerPerson: 0 },
    ],
  },
  {
    id: "hanoi",
    name: "Hanoi",
    country: "Vietnam",
    region: "Southeast Asia",
    bestMonths: "October to December, and March to April",
    costs: {
      budget: { lodging: 25, food: 15, transport: 4, misc: 8 },
      standard: { lodging: 65, food: 30, transport: 8, misc: 15 },
      comfort: { lodging: 170, food: 65, transport: 20, misc: 35 },
    },
    gettingAround: "Walk the Old Quarter, use app taxis or motorbike taxis for longer trips, and cross streets at a steady pace.",
    neighborhoods: [
      { name: "Old Quarter", goodFor: "street food, first visit" },
      { name: "Hoan Kiem lake area", goodFor: "central, a bit calmer" },
      { name: "Tay Ho (West Lake)", goodFor: "quiet stays, cafés" },
    ],
    etiquette: [
      "Dress to cover shoulders and knees at temples and the mausoleum.",
      "Agree on prices before rides and in markets.",
      "Small cash notes are useful; many street stalls take no cards.",
    ],
    activities: [
      { id: "hanoi-old-quarter-food", name: "Old Quarter street-food walk", slot: "evening", hours: 3, costPerPerson: 20 },
      { id: "hanoi-temple-literature", name: "Temple of Literature", slot: "morning", hours: 2, costPerPerson: 2 },
      { id: "hanoi-ha-long", name: "Day trip to Ha Long Bay", slot: "fullday", hours: 11, costPerPerson: 60 },
      { id: "hanoi-water-puppets", name: "Water puppet show", slot: "evening", hours: 1, costPerPerson: 6 },
      { id: "hanoi-hoan-kiem", name: "Morning walk around Hoan Kiem lake", slot: "morning", hours: 1.5, costPerPerson: 0 },
      { id: "hanoi-cooking-class", name: "Vietnamese cooking class", slot: "afternoon", hours: 3, costPerPerson: 35 },
    ],
  },
  {
    id: "vancouver",
    name: "Vancouver",
    country: "Canada",
    region: "North America",
    bestMonths: "June to September",
    costs: {
      budget: { lodging: 90, food: 40, transport: 10, misc: 15 },
      standard: { lodging: 200, food: 70, transport: 15, misc: 30 },
      comfort: { lodging: 420, food: 120, transport: 40, misc: 55 },
    },
    gettingAround: "SkyTrain, buses and the SeaBus share one fare system; downtown and Stanley Park are easy to bike.",
    neighborhoods: [
      { name: "Downtown", goodFor: "transit, first visit" },
      { name: "West End", goodFor: "beaches, Stanley Park" },
      { name: "Kitsilano", goodFor: "beach, relaxed cafés" },
    ],
    etiquette: [
      "Tip about 18 to 20 percent in restaurants.",
      "Rain is common outside summer; pack a light rain jacket.",
      "Stand on the right on escalators.",
    ],
    activities: [
      { id: "van-stanley-park", name: "Bike the Stanley Park seawall", slot: "morning", hours: 3, costPerPerson: 15 },
      { id: "van-granville", name: "Granville Island market", slot: "any", hours: 2, costPerPerson: 15 },
      { id: "van-capilano", name: "Suspension bridge park on the North Shore", slot: "afternoon", hours: 3, costPerPerson: 55 },
      { id: "van-grouse", name: "Grouse Mountain views", slot: "afternoon", hours: 4, costPerPerson: 60 },
      { id: "van-whistler", name: "Day trip on the Sea-to-Sky road to Whistler", slot: "fullday", hours: 9, costPerPerson: 50 },
      { id: "van-gastown", name: "Evening in Gastown", slot: "evening", hours: 2, costPerPerson: 0 },
    ],
  },
  {
    id: "jaipur",
    name: "Jaipur",
    country: "India",
    region: "South Asia",
    bestMonths: "October to March",
    costs: {
      budget: { lodging: 25, food: 12, transport: 5, misc: 8 },
      standard: { lodging: 70, food: 25, transport: 12, misc: 15 },
      comfort: { lodging: 220, food: 60, transport: 30, misc: 35 },
    },
    gettingAround: "App taxis and auto-rickshaws are easiest; agree on the fare first in a rickshaw. Sights are spread out, so plan by area.",
    neighborhoods: [
      { name: "C-Scheme", goodFor: "central, calmer, restaurants" },
      { name: "Old City (Pink City)", goodFor: "bazaars, sights on foot" },
      { name: "Bani Park", goodFor: "heritage guesthouses" },
    ],
    etiquette: [
      "Dress modestly, and cover shoulders and knees at temples.",
      "Take off your shoes before entering temples.",
      "Bargaining is normal in bazaars, less so in fixed-price shops.",
    ],
    activities: [
      { id: "jaipur-amber-fort", name: "Amber Fort", slot: "morning", hours: 3, costPerPerson: 8 },
      { id: "jaipur-city-palace", name: "City Palace and Jantar Mantar", slot: "afternoon", hours: 3, costPerPerson: 12 },
      { id: "jaipur-hawa-mahal", name: "Hawa Mahal at sunrise", slot: "morning", hours: 1, costPerPerson: 2 },
      { id: "jaipur-bazaars", name: "Shop the Johari and Bapu bazaars", slot: "afternoon", hours: 3, costPerPerson: 0 },
      { id: "jaipur-nahargarh", name: "Sunset at Nahargarh Fort", slot: "evening", hours: 2, costPerPerson: 3 },
      { id: "jaipur-block-print", name: "Block-printing workshop", slot: "any", hours: 2, costPerPerson: 20 },
    ],
  },
  {
    id: "istanbul",
    name: "Istanbul",
    country: "Türkiye",
    region: "Europe",
    bestMonths: "April to June, and September to November",
    costs: {
      budget: { lodging: 40, food: 20, transport: 5, misc: 10 },
      standard: { lodging: 100, food: 40, transport: 10, misc: 20 },
      comfort: { lodging: 250, food: 80, transport: 25, misc: 40 },
    },
    gettingAround: "Trams, metro and ferries all use one rechargeable card; ferries across the Bosphorus are a sight in themselves.",
    neighborhoods: [
      { name: "Sultanahmet", goodFor: "major sights on foot" },
      { name: "Karaköy and Galata", goodFor: "cafés, nightlife, ferries" },
      { name: "Kadıköy (Asian side)", goodFor: "food markets, local feel" },
    ],
    etiquette: [
      "Women cover their hair in mosques; everyone covers shoulders and knees.",
      "Mosques close to visitors during prayer times.",
      "Tip about 10 percent in restaurants.",
    ],
    activities: [
      { id: "ist-hagia-sophia", name: "Hagia Sophia and the Blue Mosque", slot: "morning", hours: 3, costPerPerson: 28 },
      { id: "ist-topkapi", name: "Topkapı Palace", slot: "afternoon", hours: 3, costPerPerson: 35 },
      { id: "ist-grand-bazaar", name: "Grand Bazaar and the Spice Bazaar", slot: "any", hours: 3, costPerPerson: 0 },
      { id: "ist-bosphorus", name: "Ferry ride on the Bosphorus", slot: "afternoon", hours: 2, costPerPerson: 5 },
      { id: "ist-kadikoy-food", name: "Food walk in Kadıköy", slot: "evening", hours: 3, costPerPerson: 35 },
      { id: "ist-hammam", name: "Visit a historic hammam", slot: "evening", hours: 2, costPerPerson: 60 },
    ],
  },
];

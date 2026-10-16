export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** "grid" street plans vs organic/off-straight ones; "spot" for places you add. */
  layout: "grid" | "organic" | "spot";
  note: string;
}

export const PLACES: Place[] = [
  { id: "manhattan", name: "Manhattan, Midtown", lat: 40.75489, lng: -73.98402, layout: "grid", note: "Strict grid, tall buildings" },
  { id: "barcelona", name: "Barcelona, Eixample", lat: 41.39362, lng: 2.16301, layout: "grid", note: "Grid with chamfered blocks" },
  { id: "chicago", name: "Chicago, Loop", lat: 41.88069, lng: -87.62979, layout: "grid", note: "Grid, river, elevated rail" },
  { id: "soho", name: "London, Soho", lat: 51.51334, lng: -0.13403, layout: "organic", note: "Medieval street pattern" },
  { id: "etoile", name: "Paris, Étoile", lat: 48.87379, lng: 2.29504, layout: "organic", note: "Radial avenues around a star" },
  { id: "amsterdam", name: "Amsterdam, canal ring", lat: 52.36756, lng: 4.88731, layout: "organic", note: "Concentric curved canals" },
  { id: "venice", name: "Venice, Rialto", lat: 45.43801, lng: 12.33577, layout: "organic", note: "Water everywhere, no roads" },
  { id: "marrakech", name: "Marrakech, medina", lat: 31.62948, lng: -7.98905, layout: "organic", note: "Dense alleys and courtyards" },
  { id: "stives", name: "St Ives, Cornwall", lat: 50.21348, lng: -5.47903, layout: "organic", note: "Harbour village and coast" },
];

/**
 * Finds a lat/lng in whatever you paste: "51.51, -0.13", a Google Maps link (…/@51.51,-0.13,17z),
 * an OpenStreetMap link (#map=17/51.51/-0.13 or ?mlat=…&mlon=…), or a link from our picker (#16/51.51/-0.13).
 */
export function parseSpot(text: string): { lat: number; lng: number } | null {
  let t = text.trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    // not URL-encoded; use as is
  }
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const patterns = [
    new RegExp(`@${num},${num}`),
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`map=\\d+(?:\\.\\d+)?/${num}/${num}`),
    new RegExp(`mlat=${num}.*mlon=${num}`),
    new RegExp(`#\\d+(?:\\.\\d+)?/${num}/${num}`),
    new RegExp(`${num}\\s*[,;\\s]\\s*${num}`),
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}

export function spotPlace(lat: number, lng: number, name?: string): Place {
  const r = (v: number) => v.toFixed(5);
  return {
    id: `spot_${r(lat)}_${r(lng)}`, // no commas: ids are comma-joined in the URL
    name: name?.trim() || `Spot ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    lat: Number(r(lat)),
    lng: Number(r(lng)),
    layout: "spot",
    note: "Your spot",
  };
}

/** Dense, interesting city centres for "surprise me" (a random point near one of these). */
export const RANDOM_CITIES: [string, number, number][] = [
  ["Tokyo", 35.6895, 139.6917], ["Seoul", 37.5665, 126.978], ["Hong Kong", 22.2819, 114.1583], ["Singapore", 1.2847, 103.851],
  ["Bangkok", 13.7466, 100.5393], ["Mumbai", 18.9388, 72.8354], ["Istanbul", 41.0082, 28.9784], ["Cairo", 30.0444, 31.2357],
  ["Lagos", 6.4541, 3.3947], ["Nairobi", -1.2864, 36.8172], ["Cape Town", -33.9249, 18.4241], ["Rome", 41.8986, 12.4769],
  ["Berlin", 52.5208, 13.4094], ["Prague", 50.0875, 14.4213], ["Vienna", 48.2082, 16.3738], ["Lisbon", 38.7107, -9.1365],
  ["Madrid", 40.4168, -3.7038], ["Edinburgh", 55.9496, -3.1905], ["Dublin", 53.3438, -6.2546], ["Copenhagen", 55.6786, 12.5635],
  ["Stockholm", 59.3251, 18.0711], ["Helsinki", 60.1699, 24.9384], ["Moscow", 55.7539, 37.6208], ["Athens", 37.9755, 23.7348],
  ["New York", 40.7128, -74.006], ["San Francisco", 37.7879, -122.4075], ["Los Angeles", 34.0522, -118.2437], ["Toronto", 43.6511, -79.3832],
  ["Mexico City", 19.4326, -99.1332], ["Havana", 23.1365, -82.3586], ["Rio de Janeiro", -22.9068, -43.1729], ["Buenos Aires", -34.6037, -58.3816],
  ["Sydney", -33.8688, 151.2093], ["Melbourne", -37.8136, 144.9631], ["Kyoto", 35.0037, 135.7788], ["Hanoi", 21.0285, 105.8542],
  ["Jerusalem", 31.7767, 35.2345], ["Fez", 34.0644, -4.9737], ["Glasgow", 55.8609, -4.2514], ["Naples", 40.8518, 14.2681],
];

export const DEFAULT_PLACES = ["manhattan", "barcelona", "soho", "etoile"];

export interface Zoom {
  id: string;
  name: string;
  /** Screen pixels per world cell (~1–1.5 m). */
  scale: number;
}

export const ZOOMS: Zoom[] = [
  { id: "upclose", name: "Up close", scale: 40 },
  { id: "foot", name: "On foot", scale: 22 },
  { id: "close", name: "Close", scale: 12 },
  { id: "game", name: "Vehicle", scale: 7 },
  { id: "mid", name: "Street", scale: 4 },
  { id: "far", name: "District", scale: 1.25 },
];

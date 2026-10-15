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

export const DEFAULT_PLACES = ["manhattan", "barcelona", "soho", "etoile"];

export interface Zoom {
  id: string;
  name: string;
  /** Screen pixels per world cell (~1–1.5 m). */
  scale: number;
}

export const ZOOMS: Zoom[] = [
  { id: "close", name: "Close", scale: 12 },
  { id: "mid", name: "Street", scale: 4 },
  { id: "far", name: "District", scale: 1.25 },
];

export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** "grid" street plans vs organic/off-straight ones. */
  layout: "grid" | "organic";
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

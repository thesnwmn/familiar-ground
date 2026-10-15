import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";

/** Prototypes that accept ?lat=&lng=&seed=. Dev servers run on fixed ports; on Pages they're siblings. */
const PROTOTYPES = [{ name: "ASCII", url: import.meta.env.DEV ? "http://localhost:5174/" : "../01-ascii/" }];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const seedInput = $<HTMLInputElement>("seed");
const picked = $<HTMLParagraphElement>("picked");
const play = $<HTMLDivElement>("play");

const randomSeed = () => Math.floor(Math.random() * 1_000_000);
seedInput.value = String(randomSeed());
$("reroll").addEventListener("click", () => {
  seedInput.value = String(randomSeed());
  renderLinks();
});
seedInput.addEventListener("input", () => renderLinks());

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-0.1276, 51.5072],
  zoom: 13,
  hash: true,
});
map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new maplibregl.GeolocateControl({}), "top-right");

const marker = new maplibregl.Marker({ color: "#e4572e" });
let choice: { lng: number; lat: number } | null = null;

map.on("click", (e) => pick(e.lngLat.lng, e.lngLat.lat));

function pick(lng: number, lat: number): void {
  choice = { lng, lat };
  marker.setLngLat([lng, lat]).addTo(map);
  picked.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  renderLinks();
}

function renderLinks(): void {
  play.replaceChildren();
  if (!choice) return;
  const seed = Math.max(0, Math.floor(Number(seedInput.value) || 0));
  for (const p of PROTOTYPES) {
    const url = new URL(p.url, location.href);
    url.searchParams.set("lat", choice.lat.toFixed(6));
    url.searchParams.set("lng", choice.lng.toFixed(6));
    url.searchParams.set("seed", String(seed));
    const a = document.createElement("a");
    a.className = "play";
    a.href = url.toString();
    a.textContent = `Play here: ${p.name}`;
    play.append(a);
  }
}

// Place search via Nominatim: one request per explicit search (no autocomplete), per its usage policy.
$<HTMLFormElement>("search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $<HTMLInputElement>("q").value.trim();
  if (!q) return;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    if (!hit) {
      picked.textContent = `Nothing found for "${q}".`;
      return;
    }
    const lng = Number(hit.lon);
    const lat = Number(hit.lat);
    map.flyTo({ center: [lng, lat], zoom: 16 });
    pick(lng, lat);
  } catch {
    picked.textContent = "Search failed; try clicking the map instead.";
  }
});

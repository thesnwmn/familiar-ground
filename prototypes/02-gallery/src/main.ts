import { CHUNK_CELLS, CHUNK_ZOOM, MemoryDeltaStore, World, lngLatToTile } from "@familiar-ground/world-core";
import { createWorkerProvider } from "../../01-play/src/workerProvider.ts";
import { DEFAULT_PLACES, PLACES as BUILT_IN, RANDOM_CITIES, ZOOMS, parseSpot, spotPlace, type Place, type Zoom } from "./places.ts";
import { tierOf, type Tier } from "./styles/tiers.ts";
import { Scene } from "./scene.ts";
import { ALL_STYLES, GROUPS } from "./styles/index.ts";
import type { StillStyle } from "./styles/types.ts";

const params = new URLSearchParams(location.search);
const tilesUrl = params.get("tiles") ?? undefined;
const SIZES = { s: [240, 180], m: [360, 270], l: [480, 360] } as const;
type SizeKey = keyof typeof SIZES;

// Your own spots: ?spots=lat,lng,name;lat,lng,…  (added from the box below, or from the picker).
const spots: Place[] = (params.get("spots") ?? "")
  .split(";")
  .map((s) => {
    const [lat, lng, ...name] = s.split(",");
    return lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? spotPlace(Number(lat), Number(lng), name.join(",")) : null;
  })
  .filter((p): p is Place => !!p);
let PLACES: Place[] = [...spots, ...BUILT_IN];

const state = {
  places: (params.get("places")?.split(",") ?? (spots.length ? spots.map((s) => s.id) : DEFAULT_PLACES)).filter((id) => PLACES.some((p) => p.id === id)),
  zooms: params.get("zooms")?.split(",") ?? ZOOMS.map((z) => z.id),
  groups: params.get("groups")?.split(",") ?? GROUPS,
  tiers: params.get("tiers")?.split(",") ?? ["A", "B", "C", "D"],
  size: (params.get("size") as SizeKey) in SIZES ? (params.get("size") as SizeKey) : ("m" as SizeKey),
  seed: Number(params.get("seed") ?? 7) || 7,
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const playUrl = import.meta.env.DEV ? "http://localhost:5174/" : "../01-play/";

// --- World: one shared world for every place (chunks are built in a worker) ---
let world = makeWorld();
function makeWorld(): World {
  return new World(createWorkerProvider(tilesUrl, state.seed), new MemoryDeltaStore(), "gallery:");
}
const placeLoads = new Map<string, Promise<void>>();
const center = (p: Place) => {
  const t = lngLatToTile({ lat: p.lat, lng: p.lng }, CHUNK_ZOOM);
  return { x: t.x * CHUNK_CELLS, y: t.y * CHUNK_CELLS };
};
function loadPlace(p: Place, radius: number): Promise<void> {
  const key = `${p.id}:${radius}`;
  let job = placeLoads.get(key);
  if (!job) {
    const c = center(p);
    job = world.ensureAround(Math.floor(c.x), Math.floor(c.y), radius).then(() => undefined);
    placeLoads.set(key, job);
  }
  return job;
}

// --- Rendering queue: one image at a time, nearest-to-view first ---
interface Job {
  key: string;
  style: StillStyle;
  place: Place;
  zoom: Zoom;
  w: number;
  h: number;
  resolve: (r: { url: string; ms: number } | { error: string }) => void;
}
const cache = new Map<string, Promise<{ url: string; ms: number } | { error: string }>>();
const queue: Job[] = [];
let running = false;
let done = 0;

function render(style: StillStyle, place: Place, zoom: Zoom, w: number, h: number, priority = false): Promise<{ url: string; ms: number } | { error: string }> {
  const key = `${style.id}|${place.id}|${zoom.id}|${w}x${h}|${state.seed}`;
  let p = cache.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      const job = { key, style, place, zoom, w, h, resolve };
      if (priority) queue.unshift(job);
      else queue.push(job);
    });
    cache.set(key, p);
    void pump();
  }
  return p;
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift()!;
    try {
      const radius = Math.ceil(Math.hypot(job.w, job.h) / 2 / job.zoom.scale) + 24;
      await loadPlace(job.place, radius);
      const c = center(job.place);
      const t0 = performance.now();
      const sc = new Scene(world, state.seed, c.x, c.y, job.zoom.scale, job.w, job.h);
      const canvas = document.createElement("canvas");
      canvas.width = job.w;
      canvas.height = job.h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      await job.style.draw(sc, ctx);
      const ms = Math.round(performance.now() - t0);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      job.resolve(blob ? { url: URL.createObjectURL(blob), ms } : { error: "no image" });
    } catch (err) {
      console.error(job.style.id, err);
      job.resolve({ error: (err as Error).message ?? String(err) });
    }
    done++;
    $("progress").textContent = `${done} rendered${queue.length ? `, ${queue.length} queued` : ""}`;
    await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
  }
  running = false;
}

// --- Controls ---
function chips(el: HTMLElement, items: { id: string; label: string; note?: string }[], selected: string[], onChange: (ids: string[]) => void): void {
  el.replaceChildren();
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.setAttribute("aria-pressed", String(selected.includes(it.id)));
    b.innerHTML = `${it.label}${it.note ? `<small>${it.note}</small>` : ""}`;
    b.addEventListener("click", () => {
      const on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", String(on));
      const next = items.filter((i) => (i.id === it.id ? on : selected.includes(i.id))).map((i) => i.id);
      selected.splice(0, selected.length, ...next);
      onChange(next);
    });
    el.append(b);
  }
}

function syncUrl(): void {
  const q = new URLSearchParams(params);
  q.set("places", state.places.join(","));
  if (spots.length) q.set("spots", spots.map((s) => `${s.lat},${s.lng}${s.name.startsWith("Spot ") ? "" : `,${s.name}`}`).join(";"));
  else q.delete("spots");
  q.set("zooms", state.zooms.join(","));
  q.set("size", state.size);
  q.set("seed", String(state.seed));
  if (state.groups.length !== GROUPS.length) q.set("groups", state.groups.join(","));
  else q.delete("groups");
  if (state.tiers.length !== 4) q.set("tiers", state.tiers.join(","));
  else q.delete("tiers");
  history.replaceState(null, "", `?${q}`);
}

function placeChips(): void {
  chips($("places"), PLACES.map((p) => ({ id: p.id, label: p.name, note: p.layout === "spot" ? "yours" : p.layout })), state.places, () => build());
}
placeChips();

function addSpot(lat: number, lng: number, name?: string): void {
  const p = spotPlace(lat, lng, name);
  if (!spots.some((s) => s.id === p.id)) spots.unshift(p);
  PLACES = [...spots, ...BUILT_IN];
  if (!state.places.includes(p.id)) state.places.unshift(p.id);
  placeChips();
  build();
  $("styles").scrollIntoView({ behavior: "smooth" });
}

const spotMsg = $("spot-msg");
$<HTMLFormElement>("spot-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const at = parseSpot($<HTMLInputElement>("spot").value);
  if (!at) {
    spotMsg.textContent = "Couldn't find coordinates in that. Try \"51.5136, -0.1336\" or paste a map link.";
    return;
  }
  spotMsg.textContent = "";
  addSpot(at.lat, at.lng, $<HTMLInputElement>("spot-name").value);
  $<HTMLInputElement>("spot").value = "";
  $<HTMLInputElement>("spot-name").value = "";
});
$("locate").addEventListener("click", () => {
  if (!navigator.geolocation) return void (spotMsg.textContent = "Location isn't available in this browser.");
  spotMsg.textContent = "Finding you…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      spotMsg.textContent = "";
      addSpot(pos.coords.latitude, pos.coords.longitude, "Where I am");
    },
    (err) => (spotMsg.textContent = `Couldn't get your location: ${err.message}`),
    { enableHighAccuracy: true, timeout: 15000 },
  );
});
chips($("zooms"), ZOOMS.map((z) => ({ id: z.id, label: z.name })), state.zooms, () => build());
chips($("groups"), GROUPS.map((g) => ({ id: g, label: g })), state.groups, () => build());
chips($("tiers"), [
  { id: "A", label: "A", note: "build on it" },
  { id: "B", label: "B", note: "alternative / theme" },
  { id: "C", label: "C", note: "map / gadget / UI" },
  { id: "D", label: "D", note: "art toy" },
], state.tiers, () => build());

$("surprise").addEventListener("click", () => {
  // Three random spots near real city centres (random points on Earth are mostly sea).
  let n = Date.now();
  const rnd = () => ((n = (n * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 3; k++) {
    const [name, lat, lng] = RANDOM_CITIES[Math.floor(rnd() * RANDOM_CITIES.length)]!;
    addSpot(lat + (rnd() - 0.5) * 0.02, lng + (rnd() - 0.5) * 0.02, `🎲 ${name}`);
  }
});
const sizeSel = $<HTMLSelectElement>("size");
sizeSel.value = state.size;
sizeSel.addEventListener("change", () => {
  state.size = sizeSel.value as SizeKey;
  build();
});
const seedIn = $<HTMLInputElement>("seed");
seedIn.value = String(state.seed);
seedIn.addEventListener("change", () => {
  state.seed = Math.max(0, Math.floor(Number(seedIn.value) || 0));
  world = makeWorld();
  placeLoads.clear();
  build();
});

// --- Page ---
const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      observer.unobserve(e.target);
      (e.target as HTMLElement & { start?: () => void }).start?.();
    }
  },
  { rootMargin: "400px 200px" },
);

function build(): void {
  syncUrl();
  queue.length = 0; // forget off-screen work from the previous layout
  for (const [k, p] of cache) void p.then((r) => "error" in r && cache.delete(k));
  const main = $("styles");
  main.replaceChildren();
  const [w, h] = SIZES[state.size];
  const places = PLACES.filter((p) => state.places.includes(p.id));
  const zooms = ZOOMS.filter((z) => state.zooms.includes(z.id));
  for (const group of GROUPS) {
    if (!state.groups.includes(group)) continue;
    const h2 = document.createElement("h2");
    h2.className = "group";
    h2.textContent = group;
    main.append(h2);
    const order: Record<Tier, number> = { A: 0, B: 1, C: 2, D: 3 };
    const inGroup = ALL_STYLES.filter((s) => s.group === group && state.tiers.includes(tierOf(s.id)[0]));
    inGroup.sort((a, b) => order[tierOf(a.id)[0]] - order[tierOf(b.id)[0]]);
    if (!inGroup.length) {
      h2.remove();
      continue;
    }
    for (const style of inGroup) {
      const sec = document.createElement("section");
      sec.className = "style";
      const head = document.createElement("div");
      head.className = "head";
      head.innerHTML = `<h3></h3>`;
      head.querySelector("h3")!.textContent = style.name;
      const [tier, why] = tierOf(style.id);
      const badge = document.createElement("span");
      badge.className = `tier tier-${tier}`;
      badge.textContent = `${tier}`;
      badge.title = why;
      const whyEl = document.createElement("span");
      whyEl.className = "why";
      whyEl.textContent = why;
      head.prepend(badge);
      head.append(whyEl);
      // Every style can be played: the game's own renderers directly, lab styles through an adapter.
      const p = places[0] ?? PLACES[0]!;
      const a = document.createElement("a");
      a.className = "play";
      a.href = `${playUrl}?lat=${p.lat}&lng=${p.lng}&seed=${state.seed}&style=${style.playable ?? `lab:${style.id}`}${tilesUrl ? `&tiles=${encodeURIComponent(tilesUrl)}` : ""}`;
      a.textContent = `Play at ${p.name} →`;
      head.append(a);
      const blurb = document.createElement("p");
      blurb.className = "blurb";
      blurb.textContent = style.blurb;
      const strip = document.createElement("div");
      strip.className = "strip";
      for (const place of places) {
        for (const zoom of zooms) {
          const fig = document.createElement("figure");
          fig.className = "tile";
          fig.style.width = `${w}px`;
          const box = document.createElement("div") as HTMLDivElement & { start?: () => void };
          box.className = "img";
          box.style.width = `${w}px`;
          box.style.height = `${h}px`;
          box.textContent = "…";
          const cap = document.createElement("figcaption");
          cap.textContent = `${place.name} · ${zoom.name}`;
          box.start = () => {
            box.textContent = "rendering…";
            void render(style, place, zoom, w, h).then((r) => {
              if ("error" in r) {
                box.textContent = `error: ${r.error}`;
                return;
              }
              const img = new Image(w, h);
              img.src = r.url;
              img.alt = `${style.name}, ${place.name}, ${zoom.name}`;
              img.title = `${r.ms} ms`;
              box.replaceChildren(img);
            });
          };
          box.addEventListener("click", () => openLightbox(style, place, zoom));
          observer.observe(box);
          fig.append(box, cap);
          strip.append(fig);
        }
      }
      sec.append(head, blurb, strip);
      main.append(sec);
    }
  }
}

// --- Lightbox: a large render on demand ---
const lb = $("lightbox");
lb.addEventListener("click", () => (lb.hidden = true));
document.addEventListener("keydown", (e) => e.key === "Escape" && (lb.hidden = true));
function openLightbox(style: StillStyle, place: Place, zoom: Zoom): void {
  const w = Math.min(1200, Math.floor(window.innerWidth * 0.96));
  const h = Math.min(900, Math.floor(window.innerHeight * 0.82));
  lb.hidden = false;
  $("lb-caption").textContent = `${style.name} · ${place.name} · ${zoom.name} — ${style.blurb}`;
  $("lb-image").innerHTML = `<div class="loading">rendering…</div>`;
  void render(style, place, zoom, w, h, true).then((r) => {
    if (lb.hidden) return;
    if ("error" in r) return ($("lb-image").textContent = `error: ${r.error}`);
    const img = new Image();
    img.src = r.url;
    $("lb-image").replaceChildren(img);
  });
}

build();

import {
  CHUNK_CELLS,
  CHUNK_ZOOM,
  GROUND_NAMES,
  Ground,
  Structure,
  World,
  isWalkable,
  lngLatToTile,
  tileToLngLat,
} from "@familiar-ground/world-core";
import { createIdbDeltaStore } from "./idbStore.ts";
import { poiAt } from "./pois.ts";
import type { Renderer, View } from "./renderers/types.ts";
import { STYLES, labStyles, styleById } from "./styles.ts";
import { createWorkerProvider } from "./workerProvider.ts";

// --- Parameters: ?lat=&lng=&seed=&style=&tiles= (tiles: TileJSON or .pmtiles URL; default OpenFreeMap) ---
const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.get(k) !== null && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : d);
const start = { lat: num("lat", 51.5072), lng: num("lng", -0.1276) };
const seed = Math.floor(num("seed", 1));
const tilesUrl = params.get("tiles") ?? undefined;

const pickerUrl = import.meta.env.DEV ? "http://localhost:5173/" : "../00-picker/";
(document.getElementById("back") as HTMLAnchorElement).href = `${pickerUrl}#16/${start.lat}/${start.lng}`;

const screen = document.getElementById("screen")!;
const statusEl = document.getElementById("status")!;
const infoEl = document.getElementById("info")!;
let dirty = true;

// --- World (shared by every style; switching style keeps the world and your changes) ---
let renderer: Renderer | undefined;
const world = new World(
  createWorkerProvider(tilesUrl, seed),
  createIdbDeltaStore(),
  `v1:${tilesUrl ?? "ofm"}:${seed}:`,
  (chunk) => {
    renderer?.chunkLoaded?.(chunk);
    dirty = true;
  },
  (chunk) => renderer?.chunkEvicted?.(chunk),
);

const t = lngLatToTile(start, CHUNK_ZOOM);
const player = { x: Math.floor(t.x * CHUNK_CELLS), y: Math.floor(t.y * CHUNK_CELLS), fx: 0, fy: -1 };
const view: View = { world, player, zoomLevel: 0, seed };

function cellAt(gx: number, gy: number) {
  const c = world.cell(gx, gy);
  if (!c) return undefined;
  return { chunk: c.chunk, i: c.i, ground: c.chunk.ground[c.i]!, structure: c.chunk.structure[c.i]! };
}

// --- Styles ---
const styleSelect = document.getElementById("style") as HTMLSelectElement;
for (const s of STYLES) styleSelect.append(new Option(s.label, s.id));
// The style lab's ~70 styles, added once their (lazy) code has loaded.
const labGroup = document.createElement("optgroup");
labGroup.label = "Style lab (unoptimised)";
styleSelect.append(labGroup);
const labLoaded = labStyles().then((list) => {
  for (const s of list) labGroup.append(new Option(s.label, s.id));
  styleSelect.value = params.get("style") ?? styleSelect.value;
});
let styleRequest = 0;

async function setStyle(id: string | null): Promise<void> {
  const info = styleById(id);
  const request = ++styleRequest;
  if (info.id.startsWith("lab:") && ![...styleSelect.options].some((o) => o.value === info.id)) await labLoaded;
  styleSelect.value = info.id;
  statusEl.textContent = `Loading ${info.label}…`;
  let next: Renderer;
  try {
    next = await info.load();
  } catch (err) {
    statusEl.textContent = `Couldn't load ${info.label}: ${(err as Error).message}`;
    return;
  }
  if (request !== styleRequest) return next.destroy();
  renderer?.destroy();
  renderer = next;
  renderer.mount(screen);
  renderer.resize(screen.clientWidth, screen.clientHeight);
  for (const chunk of world.loaded()) renderer.chunkLoaded?.(chunk);
  view.zoomLevel = renderer.defaultZoom;
  params.set("style", info.id);
  history.replaceState(null, "", `?${params}`);
  document.title = `Familiar Ground: ${info.label}`;
  statusEl.textContent = "";
  dirty = true;
  void stream();
}
styleSelect.addEventListener("change", () => {
  void setStyle(styleSelect.value);
  screen.focus();
});

new ResizeObserver(() => {
  renderer?.resize(screen.clientWidth, screen.clientHeight);
  dirty = true;
}).observe(screen);

// --- HUD ---
function describe(gx: number, gy: number): string {
  const c = cellAt(gx, gy);
  if (!c) return "unloaded";
  if (c.structure === Structure.BUILDING) {
    const b = c.chunk.buildings[c.chunk.building[c.i]!];
    if (!b) return "building";
    const levels = b.levels ? `, ${b.levels} floor${b.levels > 1 ? "s" : ""}` : "";
    return `${b.kind === "building" ? "building" : b.kind}${b.name ? ` "${b.name}"` : ""}${levels}`;
  }
  if (c.structure === Structure.WALL) return "wall";
  if (c.structure === Structure.TREE) return "tree";
  const poi = poiAt(c.chunk, c.i);
  return (poi ? `${poi} · ` : "") + GROUND_NAMES[c.ground as Ground].toLowerCase().replace("_", " ");
}

function updateHud(): void {
  const here = tileToLngLat(player.x / CHUNK_CELLS, player.y / CHUNK_CELLS, CHUNK_ZOOM);
  const c = cellAt(player.x, player.y);
  const cellM = c ? `${c.chunk.cellSizeM.toFixed(1)} m/cell` : "";
  const levels = renderer?.zoomLevels.length ?? 1;
  infoEl.textContent =
    `${here.lat.toFixed(5)}, ${here.lng.toFixed(5)} · seed ${seed} · zoom ${view.zoomLevel + 1}/${levels} · ${cellM} · ` +
    `here: ${describe(player.x, player.y)} · facing: ${describe(player.x + player.fx, player.y + player.fy)}`;
}

// --- Streaming ---
let loadError = false;

async function stream(): Promise<void> {
  if (!renderer) return;
  const r = renderer.viewRadius(view);
  statusEl.textContent = "Loading map data…";
  try {
    await world.ensureAround(player.x, player.y, r);
    world.evictBeyond(player.x, player.y, r + 3 * CHUNK_CELLS);
    statusEl.textContent = "";
    loadError = false;
  } catch (err) {
    loadError = true;
    statusEl.textContent = `Couldn't load map data: ${(err as Error).message}`;
  }
  dirty = true;
}

/** Spawn on the nearest walkable cell (you might have clicked on a building or a lake). */
function placePlayer(): void {
  for (let r = 0; r < 200; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const c = cellAt(player.x + dx, player.y + dy);
        if (c && isWalkable(c.ground, c.structure)) {
          player.x += dx;
          player.y += dy;
          return;
        }
      }
    }
  }
}

// --- Actions (shared by keyboard, touch and buttons) ---
let lastUrlUpdate = 0;

/** Moves up to `steps` cells. Diagonals slide along walls instead of stopping dead. */
function move(dx: number, dy: number, steps: number): void {
  [player.fx, player.fy] = [dx, dy];
  const free = (x: number, y: number) => {
    const c = cellAt(x, y);
    return !!c && isWalkable(c.ground, c.structure);
  };
  for (let n = 0; n < steps; n++) {
    if (free(player.x + dx, player.y + dy) && (dx === 0 || dy === 0 || free(player.x + dx, player.y) || free(player.x, player.y + dy))) {
      player.x += dx;
      player.y += dy;
    } else if (dx !== 0 && free(player.x + dx, player.y)) {
      player.x += dx;
    } else if (dy !== 0 && free(player.x, player.y + dy)) {
      player.y += dy;
    } else {
      break;
    }
  }
  void stream();
  if (performance.now() - lastUrlUpdate > 1000) {
    lastUrlUpdate = performance.now();
    const here = tileToLngLat(player.x / CHUNK_CELLS, player.y / CHUNK_CELLS, CHUNK_ZOOM);
    params.set("lat", here.lat.toFixed(7));
    params.set("lng", here.lng.toFixed(7));
    history.replaceState(null, "", `?${params}`);
  }
  dirty = true;
}

function editFacing(apply: (gx: number, gy: number, structure: number, ground: number) => boolean): void {
  const [fx, fy] = [player.x + player.fx, player.y + player.fy];
  const c = cellAt(fx, fy);
  if (c && apply(fx, fy, c.structure, c.ground)) {
    renderer?.chunkChanged?.(c.chunk);
    dirty = true;
  }
}

/** Breaks whatever is in front: buildings and walls become rubble, trees are felled. */
function breakFacing(): void {
  editFacing((x, y, structure) => {
    if (structure === Structure.NONE) return false;
    if (structure !== Structure.TREE) world.edit(x, y, "ground", Ground.RUBBLE);
    return world.edit(x, y, "structure", Structure.NONE);
  });
}

function buildFacing(): void {
  editFacing((x, y, structure, ground) =>
    structure === Structure.NONE && ground !== Ground.WATER ? world.edit(x, y, "structure", Structure.WALL) : false,
  );
}

function setZoomLevel(level: number): void {
  if (!renderer) return;
  const next = Math.max(0, Math.min(renderer.zoomLevels.length - 1, level));
  if (next === view.zoomLevel) return;
  view.zoomLevel = next;
  void stream();
  dirty = true;
}

// --- Keyboard ---
const DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
};

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLSelectElement) return;
  const dir = DIRS[e.key];
  const levels = renderer?.zoomLevels.length ?? 1;
  if (dir) {
    e.preventDefault();
    move(dir[0], dir[1], e.shiftKey ? 4 : 1);
  } else if (e.key === "x" || e.key === "X") breakFacing();
  else if (e.key === "b" || e.key === "B") buildFacing();
  else if (e.key === "z" || e.key === "Z") setZoomLevel(view.zoomLevel === levels - 1 ? 0 : view.zoomLevel + 1);
  else if (e.key === "+" || e.key === "=") setZoomLevel(view.zoomLevel - 1);
  else if (e.key === "-" || e.key === "_") setZoomLevel(view.zoomLevel + 1);
  else if (/^[1-9]$/.test(e.key) && STYLES[Number(e.key) - 1]) void setStyle(STYLES[Number(e.key) - 1]!.id);
});

// --- Mouse wheel zoom ---
let lastWheel = 0;
screen.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (performance.now() - lastWheel < 150 || e.deltaY === 0) return;
    lastWheel = performance.now();
    setZoomLevel(view.zoomLevel + (e.deltaY > 0 ? 1 : -1));
  },
  { passive: false },
);

// --- Touch / pointer: drag anywhere to walk (virtual joystick), pinch to zoom ---
const stick = document.getElementById("stick")!;
const knob = document.getElementById("knob")!;
const pointers = new Map<number, { x: number; y: number }>();
const STICK_DEADZONE = 16;
/** How far the knob travels; full deflection is full speed. */
const STICK_MAX = 100;
/** Cells per second at the edge of the dead zone and at full deflection (before zoom scaling). */
const WALK_SPEED = 5;
const RUN_SPEED = 22;
const TICK_MS = 40;
let joystick: { id: number; x0: number; y0: number; x: number; y: number; travel: number } | null = null;
let joystickTimer: number | undefined;
let pinch: { startDist: number; startLevel: number } | null = null;

const pinchDistance = () => {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};

/** Analog joystick: speed grows with how far the knob is pushed; whole cells are taken as they accrue. */
function joystickTick(): void {
  if (!joystick) return;
  const dx = joystick.x - joystick.x0;
  const dy = joystick.y - joystick.y0;
  const dist = Math.hypot(dx, dy);
  if (dist < STICK_DEADZONE) {
    joystick.travel = 0;
    return;
  }
  const t = Math.min(1, (dist - STICK_DEADZONE) / (STICK_MAX - STICK_DEADZONE));
  const zoomSpeed = renderer?.zoomLevels[view.zoomLevel]?.speed ?? 1;
  const speed = (WALK_SPEED + (RUN_SPEED - WALK_SPEED) * t * t) * zoomSpeed;
  joystick.travel += (speed * TICK_MS) / 1000;
  const steps = Math.floor(joystick.travel);
  if (steps === 0) return;
  joystick.travel -= steps;
  // 8 directions: include an axis when it carries a good share of the drag.
  const mx = Math.abs(dx) > dist * 0.38 ? Math.sign(dx) : 0;
  const my = Math.abs(dy) > dist * 0.38 ? Math.sign(dy) : 0;
  move(mx, my, steps);
}

function showStick(): void {
  if (!joystick) {
    stick.hidden = true;
    return;
  }
  stick.hidden = false;
  stick.style.left = `${joystick.x0}px`;
  stick.style.top = `${joystick.y0}px`;
  let dx = joystick.x - joystick.x0;
  let dy = joystick.y - joystick.y0;
  const d = Math.hypot(dx, dy);
  if (d > STICK_MAX) [dx, dy] = [(dx / d) * STICK_MAX, (dy / d) * STICK_MAX];
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
}

function endJoystick(): void {
  joystick = null;
  window.clearInterval(joystickTimer);
  joystickTimer = undefined;
  showStick();
}

screen.addEventListener("pointerdown", (e) => {
  screen.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    joystick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, travel: 0 };
    joystickTimer = window.setInterval(joystickTick, TICK_MS);
    showStick();
  } else if (pointers.size === 2) {
    endJoystick();
    pinch = { startDist: pinchDistance(), startLevel: view.zoomLevel };
  }
});

screen.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pinch && pointers.size === 2) {
    // Each doubling of finger distance is roughly one zoom level in.
    const levels = Math.round(Math.log2(pinchDistance() / Math.max(1, pinch.startDist)) * 1.5);
    setZoomLevel(pinch.startLevel - levels);
  } else if (joystick && joystick.id === e.pointerId) {
    const first = Math.hypot(joystick.x - joystick.x0, joystick.y - joystick.y0) < STICK_DEADZONE;
    joystick.x = e.clientX;
    joystick.y = e.clientY;
    if (first && Math.hypot(joystick.x - joystick.x0, joystick.y - joystick.y0) >= STICK_DEADZONE) {
      joystick.travel = 1; // take the first step as soon as the drag starts, not on the next tick
      joystickTick();
    }
    showStick();
  }
});

function pointerEnd(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (joystick?.id === e.pointerId) endJoystick();
  if (pointers.size < 2) pinch = null;
  // After a pinch, lifting one finger doesn't start walking; a fresh touch does.
}
screen.addEventListener("pointerup", pointerEnd);
screen.addEventListener("pointercancel", pointerEnd);

// --- On-screen buttons ---
const ACTIONS: Record<string, () => void> = {
  break: breakFacing,
  build: buildFacing,
  "zoom-in": () => setZoomLevel(view.zoomLevel - 1),
  "zoom-out": () => setZoomLevel(view.zoomLevel + 1),
};
for (const button of document.querySelectorAll<HTMLButtonElement>("#actions button")) {
  button.addEventListener("click", () => {
    ACTIONS[button.dataset.action ?? ""]?.();
    screen.focus();
  });
}

// --- Main loop ---
function frame(): void {
  if (dirty && renderer) {
    dirty = renderer.render(view) === true;
    updateHud();
  }
  requestAnimationFrame(frame);
}

statusEl.textContent = "Loading…";
void setStyle(params.get("style")).then(() =>
  stream().then(() => {
    if (!loadError) placePlayer();
    dirty = true;
  }),
);
screen.focus();
frame();

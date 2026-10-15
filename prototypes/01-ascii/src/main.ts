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
  type Chunk,
} from "@familiar-ground/world-core";
import { Display } from "rot-js";
import { GROUND_GLYPHS, NAMED_BUILDING, PLAYER_GLYPH, POI_GLYPH, STRUCTURE_FG, UNLOADED } from "./glyphs.ts";
import { createIdbDeltaStore } from "./idbStore.ts";
import { createWorkerProvider } from "./workerProvider.ts";

// --- Parameters: ?lat=&lng=&seed=&tiles= (tiles: TileJSON or .pmtiles URL; default OpenFreeMap) ---
const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (Number.isFinite(Number(params.get(k))) && params.get(k) !== null ? Number(params.get(k)) : d);
const start = { lat: num("lat", 51.5072), lng: num("lng", -0.1276) };
const seed = Math.floor(num("seed", 1));
const tilesUrl = params.get("tiles") ?? undefined;

const back = document.getElementById("back") as HTMLAnchorElement;
back.href = import.meta.env.DEV ? `http://localhost:5173/#16/${start.lat}/${start.lng}` : `../00-picker/#16/${start.lat}/${start.lng}`;

// --- World ---
const statusEl = document.getElementById("status")!;
const infoEl = document.getElementById("info")!;
let dirty = true;
const poiCells = new Map<Chunk, Map<number, string>>();

const world = new World(createWorkerProvider(tilesUrl, seed), createIdbDeltaStore(), `v1:${tilesUrl ?? "ofm"}:${seed}:`, (chunk) => {
  poiCells.set(chunk, new Map(chunk.pois.map((p) => [p.y * chunk.size + p.x, p.name ?? p.subclass ?? p.cls])));
  dirty = true;
});

const t = lngLatToTile(start, CHUNK_ZOOM);
const player = { x: Math.floor(t.x * CHUNK_CELLS), y: Math.floor(t.y * CHUNK_CELLS), fx: 0, fy: -1 };

// --- Display ---
const display = new Display({ fontSize: 16, fontFamily: "ui-monospace, Menlo, Consolas, monospace", bg: "#000" });
const screen = document.getElementById("screen")!;
screen.append(display.getContainer()!);
let zoom = 1;

function resize(): void {
  const [cols, rows] = display.computeSize(screen.clientWidth, screen.clientHeight);
  display.setOptions({ width: Math.max(10, cols), height: Math.max(5, rows) });
  dirty = true;
}
window.addEventListener("resize", resize);
resize();

function cellAt(gx: number, gy: number) {
  const c = world.cell(gx, gy);
  if (!c) return undefined;
  return { chunk: c.chunk, i: c.i, ground: c.chunk.ground[c.i]!, structure: c.chunk.structure[c.i]! };
}

function render(): void {
  const { width, height } = display.getOptions();
  const left = player.x - Math.floor(width / 2) * zoom;
  const top = player.y - Math.floor(height / 2) * zoom;
  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      const gx = left + sx * zoom;
      const gy = top + sy * zoom;
      const c = cellAt(gx, gy);
      if (!c) {
        display.draw(sx, sy, ...UNLOADED);
        continue;
      }
      let [ch, fg, bg] = GROUND_GLYPHS[c.ground as Ground];
      const s = STRUCTURE_FG[c.structure as Structure];
      if (c.structure === Structure.BUILDING && c.chunk.buildings[c.chunk.building[c.i]!]?.kind !== "building") {
        [ch, fg, bg] = NAMED_BUILDING;
      } else if (s) {
        [ch, fg] = s;
        bg = s[2] ?? bg;
      }
      if (zoom === 1 && poiCells.get(c.chunk)?.has(c.i)) [ch, fg] = POI_GLYPH;
      if (gx === player.x && gy === player.y) [ch, fg] = PLAYER_GLYPH;
      display.draw(sx, sy, ch, fg, bg);
    }
  }
  // At zoomed-out levels the player's own cell may not be sampled; always draw them at the centre.
  if (zoom > 1) display.draw(Math.floor(width / 2), Math.floor(height / 2), PLAYER_GLYPH[0], PLAYER_GLYPH[1], "#c03");
}

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
  const poi = poiCells.get(c.chunk)?.get(c.i);
  return (poi ? `${poi} · ` : "") + GROUND_NAMES[c.ground as Ground].toLowerCase().replace("_", " ");
}

function updateHud(): void {
  const here = tileToLngLat(player.x / CHUNK_CELLS, player.y / CHUNK_CELLS, CHUNK_ZOOM);
  const c = cellAt(player.x, player.y);
  const cellM = c ? `${c.chunk.cellSizeM.toFixed(1)} m/cell` : "";
  infoEl.textContent =
    `${here.lat.toFixed(5)}, ${here.lng.toFixed(5)} · seed ${seed} · zoom ×${zoom} · ${cellM} · ` +
    `here: ${describe(player.x, player.y)} · facing: ${describe(player.x + player.fx, player.y + player.fy)}`;
}

// --- Streaming ---
const VIEW_RADIUS = () => Math.max(display.getOptions().width, display.getOptions().height) * zoom;
let loadError = false;

async function stream(): Promise<void> {
  const r = VIEW_RADIUS();
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

// --- Input ---
const DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
};
let lastUrlUpdate = 0;

window.addEventListener("keydown", (e) => {
  const dir = DIRS[e.key];
  if (dir) {
    e.preventDefault();
    [player.fx, player.fy] = dir;
    const steps = e.shiftKey ? 4 : 1;
    for (let n = 0; n < steps; n++) {
      const c = cellAt(player.x + dir[0], player.y + dir[1]);
      if (!c || !isWalkable(c.ground, c.structure)) break;
      player.x += dir[0];
      player.y += dir[1];
    }
    void stream();
    if (performance.now() - lastUrlUpdate > 1000) {
      lastUrlUpdate = performance.now();
      const here = tileToLngLat(player.x / CHUNK_CELLS, player.y / CHUNK_CELLS, CHUNK_ZOOM);
      params.set("lat", here.lat.toFixed(7));
      params.set("lng", here.lng.toFixed(7));
      history.replaceState(null, "", `?${params}`);
    }
  } else if (e.key === "x" || e.key === "X") {
    // Break whatever is in front: buildings and walls become rubble, trees are felled.
    const [fx, fy] = [player.x + player.fx, player.y + player.fy];
    const c = cellAt(fx, fy);
    if (c && c.structure !== Structure.NONE) {
      if (c.structure !== Structure.TREE) world.edit(fx, fy, "ground", Ground.RUBBLE);
      world.edit(fx, fy, "structure", Structure.NONE);
    }
  } else if (e.key === "b" || e.key === "B") {
    const [fx, fy] = [player.x + player.fx, player.y + player.fy];
    const c = cellAt(fx, fy);
    if (c && c.structure === Structure.NONE && c.ground !== Ground.WATER) world.edit(fx, fy, "structure", Structure.WALL);
  } else if (e.key === "z" || e.key === "Z") {
    zoom = zoom === 4 ? 1 : zoom * 2;
    void stream();
  } else {
    return;
  }
  dirty = true;
});

function frame(): void {
  if (dirty) {
    dirty = false;
    render();
    updateHud();
  }
  requestAnimationFrame(frame);
}

statusEl.textContent = "Loading map data…";
void stream().then(() => {
  if (!loadError) placePlayer();
  dirty = true;
});
screen.focus();
frame();

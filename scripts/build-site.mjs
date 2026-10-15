// Assembles every built prototype into one static site for GitHub Pages:
//   _site/index.html          list of prototypes
//   _site/<prototype>/...     each prototype's dist/
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "_site");
rmSync(out, { recursive: true, force: true });
mkdirSync(out);

const entries = [];
for (const name of readdirSync(join(root, "prototypes")).sort()) {
  const dir = join(root, "prototypes", name);
  const dist = join(dir, "dist");
  if (!existsSync(dist)) continue;
  cpSync(dist, join(out, name), { recursive: true });
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  entries.push({ name, description: pkg.description ?? "" });
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const items = entries
  .map((e) => `<li><a href="./${esc(e.name)}/">${esc(e.name)}</a> - ${esc(e.description)}</li>`)
  .join("\n      ");

writeFileSync(
  join(out, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Familiar Ground prototypes</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #222; background: #fafafa; }
      @media (prefers-color-scheme: dark) { body { color: #ddd; background: #161616; } a { color: #8ab4f8; } }
    </style>
  </head>
  <body>
    <h1>Familiar Ground</h1>
    <p>Prototypes for a game that starts anywhere on a real world map. Start with the picker.</p>
    <ul>
      ${items || "<li>No prototypes built yet.</li>"}
    </ul>
    <p><small>Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>.</small></p>
  </body>
</html>
`,
);
console.log(`Built _site with ${entries.length} prototype(s): ${entries.map((e) => e.name).join(", ")}`);

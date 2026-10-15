# 7. Styles for Play

The style lab (`prototypes/02-gallery`) has ~70 looks. Most are not game views. This note sorts them for the game we actually want, top-down: **explore** a real place, **gather resources**, **fight enemies and gangs**, **enter buildings**. It also picks a direction.

Every style in the lab carries a rating (A–D) with a one-line reason, and a "Play at…" link that launches it in the game so you can walk around in it.

## What a play view needs

| Need | Why it matters here |
|---|---|
| **Walkable vs blocked at a glance** | Fights and chases happen at speed; walls, water and cover must read instantly. |
| **Actors pop** | Gang members, loot and resources must stand out from any background, at any time of day. |
| **Walls you can see** | Cover, doors and "which building is this" all depend on seeing building sides, not just roofs. |
| **A way inside** | Entering buildings needs a camera that can remove roofs and show interiors. |
| **Honest visibility** | Fair fights need you to see what your character can see (line of sight), not everything. |
| **Stable while moving** | The camera shouldn't make you seasick on a phone. |
| **Zoom that fits the action** | Too close and you can't see the gang round the corner; too far and actors become dots. |
| **Cheap enough for phones** | Mobile browser, battery, 30–60 fps. |
| **Correct shapes** | Real footprints, not lumpy cell blobs; the "familiar" in Familiar Ground. |

## The camera matters more than the paint

The lab mixes two separate choices:

1. **Camera / geometry**: how buildings are projected.
   - **Flat plan**: roofs only. Readable, but you can't see walls, so cover is hard to judge.
   - **Oblique 3/4** (Zelda, Pokémon, Stardew): buildings pushed straight up the screen so south walls show. The camera never changes as you move. Very readable.
   - **Perspective from the player** (GTA 1/2): roofs lean away from the screen centre, so you see the walls facing you. The strongest sense of place, and of standing *in* a street. The lean shifts as you move, which can feel swimmy if it's too strong. The camera height tunes this (the lab shows a normal and a "low drone" version).
   - **Isometric**: classic, but buildings hide the streets behind them. Entering buildings and fighting behind cover are awkward.
   - **True 3D** (voxel, low-poly): full perspective and destructible voxels. It costs more on phones and needs camera controls.
2. **Surface / paint**: palette, pixels, ink, lighting, theme. Almost any surface works on any camera. Pixel art looks best when real shapes are drawn first and then pixelated (no blobs). Lumen's lighting works on everything.

Then there are **mechanics that are also views**: line of sight, fog of war, roof cutaways for interiors, and gadget modes (thermal, X-ray, night vision).

## Ranking

### A: build the game on these
- **Oblique 3/4 street**, and the **pixelated** and **lit night** versions. A stable camera, visible walls, crisp actors. The safest base.
- **Perspective from the player (GTA)**, day and night. The best "I'm standing in my street" feeling. Keep the lean moderate.
- **Line of sight** (night and day). The core mechanic for gang fights and stealth: buildings cast vision shadows, and enemies only show when you could really see them.
- **Entering a building (cutaway)**. The roof comes off and generated rooms appear inside the real footprint, with doors, loot and occupants. The outside dims.

### B: strong alternatives, themes and modes
- **Clean tactical plan** (XCOM / Door Kickers clarity): best for planning a raid; least mood.
- **Toy perspective**, **Toybox**, **Ligne claire**, **Stardew**, **SNES / Pokémon**: tone choices on top of the A cameras.
- **Lit plan** (warm and moonlit) and **Lumen**: gorgeous light, but flat. Use the lighting system, not the flat camera.
- **Themes**: ruins, flood, medieval, bioluminescent, winter, Frostpunk, cyberpunk rain. These are world layers, not cameras; they fit any A camera.
- **Voxel / low-poly 3D**: real perspective and destructible voxels, at a higher cost. A later "3D mode" rather than the base.
- **RTS fog of war**: a softer version of line of sight for exploring.

### C: map screens, gadgets, overlays, UI
- **Map screens**: treasure map (quests), Pip-Boy (wrist map), radar (minimap), Civ hexes (gang territory), blueprint / CAD / dungeon map (building intel and interiors), Earth at night (world map, fast travel).
- **Gadgets**: thermal goggles, X-ray (see occupants through walls), night vision. Each is a timed ability with a cost; they're a great fit for gang fights.
- **Photo, intro and menu modes**: tilt-shift, 1940s aerial, papercraft, Obra Dinn 1-bit.

### D: art toys
Lego, cross-stitch, stained glass, pointillism, risograph, newsprint, sumi-e, felt, Boogie Woogie, topographic city, Braille, Dwarf Fortress, lava, candy. Lovely to look at; they'd fight the player in a real game.

## Zoom for play

The lab now has a **Game** zoom (7 px per cell, roughly 50 × 100 m on a phone in portrait). It's the right default for fights: you see a block or two ahead and gangs at the next corner. Use **Close** (12+) inside buildings and **Street** (4) for exploring and travel. **District** (1–2) is a map, not a play zoom. Zoom should follow context: closer indoors and in combat, wider when running or driving.

## Recommendation

- **Camera**: perspective from the player with a moderate lean, or oblique 3/4 if playtesting finds the lean tiring. Both use real footprints, and both are built in the lab.
- **Visibility**: line of sight from the player, with remembered areas greyed. At night the lighting decides what you can see, and a torch extends it.
- **Surface**: real shapes drawn first, optionally pixelated, with Lumen's lighting. Themes from the lab sit on top.
- **Interiors**: roof cutaway with rooms generated from the footprint (BSP), seeded by building id. Loot comes from what the building is (pharmacy → medicine, café/supermarket → food, garage/hardware → metal).
- **Resources from the map**: wood from trees, water from rivers, metal along roads and garages, food from shops. Gang territories follow real districts and named places.
- **Gadgets as C-tier views**: thermal, X-ray and night vision as abilities.

Next step: turn the A-tier camera plus line of sight into a real renderer in `01-play`, with actors (gangs and loot) living in world-core so they persist and can be fought.

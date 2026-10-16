# 7. Styles for Play

The style lab (`prototypes/02-gallery`) has ~140 looks. Most are not game views. This note sorts them for the game we actually want, top-down: **explore** a real place, **gather resources**, **fight enemies and gangs**, **enter buildings**. It also picks a direction.

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

## Plans with walls (any surface, any camera)

The plan and line styles were flat because they began as map looks. A camera doesn't care about the paint, though, so the lab now stands every plan look up with walls. There are about 30 surfaces, from clean, ligne claire, lit plan, moonlit, tactical and 16-bit to watercolour, blueprint, neon, noir, Obra Dinn, ruins, flood, medieval, winter, Frostpunk, desert and more. Each comes with:

- **Oblique 3/4** (group *Walls: oblique 3/4*): pushed straight up the screen.
- **From the player** (group *Walls: from the player*): GTA-style lean away from the screen centre.
- **Low drone** and **cavalier** (an Ultima-style slant that shows two sides of every block) for some of them (group *Walls: other cameras*).

Smooth vector lines plus walls are the best of both: real shapes, crisp edges, visible cover. The playable candidates now include **ligne claire oblique**, **tactical oblique**, **lit plan from the player** and **clean plan from the player**, each with actors and a HUD.

## Turning the camera

An oblique camera only shows south walls, so a gang hiding behind the north side of a block is invisible. Turning the camera fixes that, and it makes going round a building feel like going round it.

- **How it works**: the flat ground is painted once and rotated as an image. Buildings are re-projected from a rotated copy of the scene, so walls always stand up the screen and you see a different set of them at each angle. Movement is relative to the screen (push up and you walk up the screen), snapped to the 8 grid directions.
- **Controls in the game** (styles marked ↻): **Q**/**E** turn 45°, a two-finger twist turns freely, and **F** / *Follow street* turns the camera so the street you're on runs up the screen. Walk round a corner or a roundabout and the city swings round with you. The turn is eased so it doesn't snap.
- **In the lab**: the *Camera angle* control (0°, 30°, 45°, 90°, 180°, follow the street) applies to every ↻ style.
- **Feel**: follow-the-street is lovely when walking and disorienting when fighting. A good default is follow-the-street when exploring and a locked angle in combat (lock on the first shot), with Q/E always available. A minimap that keeps north up helps orientation.
- **From the player** needs rotation less: the lean already shows walls on every side of you. Rotation there is mainly for lining the view up with the street.

## Zoom for play

On foot is much closer than first assumed. A cell is about 1.5 m (in London), and a phone in portrait is about 400 px wide.

| Zoom | px per cell | Phone width shows | Use |
|---|---|---|---|
| Up close | 40 | ~15 m | Inside buildings, melee, looting, conversations |
| **On foot** (default) | 20–22 | ~30 m | Walking, exploring and gunfights: a street and both pavements |
| Close | 12–14 | ~50 m | Running, scouting a block |
| Vehicle | 7 | ~90 m | Driving: you need to see the junction ahead |
| Street | 4 | ~150 m | Fast travel and planning |
| District | 1–2 | ~400 m+ | A map, not a play view |

Every style in the game now has the closer levels; on foot is the default, and the closer levels walk slower on screen. Zoom should follow context: up close indoors, on foot by default, pulled out when running and further when driving. Up close is where styles need the most detail: flat colours that look fine from afar look empty at 40 px per cell, so close-up play needs textured ground, props (bins, benches, cars, lamps), animated details and lighting. That's what the next Lumen work should explore.

## Recommendation

- **Camera**: perspective from the player with a moderate lean, or oblique 3/4 with a turnable / follow-the-street camera if playtesting finds the lean tiring. Both use real footprints, and both are built in the lab.
- **Lines**: draw it as a plan with walls (ligne claire, clean or tactical), not as pixels from cells: smooth lines, real shapes and readable cover.
- **Visibility**: line of sight from the player, with remembered areas greyed. At night the lighting decides what you can see, and a torch extends it.
- **Surface**: real shapes drawn first, optionally pixelated, with Lumen's lighting. Themes from the lab sit on top.
- **Interiors**: roof cutaway with rooms generated from the footprint (BSP), seeded by building id. Loot comes from what the building is (pharmacy → medicine, café/supermarket → food, garage/hardware → metal).
- **Resources from the map**: wood from trees, water from rivers, metal along roads and garages, food from shops. Gang territories follow real districts and named places.
- **Gadgets as C-tier views**: thermal, X-ray and night vision as abilities.

Next step: turn the A-tier camera plus line of sight into a real renderer in `01-play`, with actors (gangs and loot) living in world-core so they persist and can be fought.

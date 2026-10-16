# 8. Lumen HD

A first go at a detailed, living version of the Lumen look, for close-up play on foot. It's a playable renderer in `01-play` (`prototypes/01-play/src/renderers/lumenhd/`), with styles for golden hour, day, night, rainy night and a four-minute day/night cycle.

## Smooth shapes, pixel materials

Rasterising the map at a few texels per cell gives stepped diagonal roads and lumpy buildings. Lumen HD splits the two jobs:

- **Geometry is vector, at device resolution.** Road edges, kerbs, lane markings, zebra crossings, building footprints, walls, roofs and shadows are drawn as smooth anti-aliased shapes, so a diagonal street is a clean line at any angle. Ground materials (grass, water, plazas) are traced from the cell grid with bilinear edges and a little noise, so they're smooth and organic too.
- **Surfaces are pixel art.** Every material is a small tileable texture with chunky texels (8 per cell, about 19 cm). There are paving slabs, cobbles, tarmac with patches, grass with flowers, brick, render, stone, glass, slate, pantiles, gravel, tar and metal. People, props, birds and trees are pixel sprites.

This is the "HD-2D" approach: crisp shapes with handmade-looking surfaces.

## What's there

- **Buildings**: real footprints with textured, shaded walls. Windows on every floor sit on the wall surface, and some are lit at night. Each building gets a door with a porch light, or a shopfront with a striped awning, a lit interior and a neon sign if a shop or café is inside. Roofs are pitched (a ridge with a shaded side) or flat (a parapet rim, AC units, vents, skylights, solar panels and plants).
- **Streets**: kerbs, dashed centre lines and edge lines, manholes, and zebra crossings where footpaths cross roads. On the pavements there are lamp posts, street trees, bins, benches, bollards, post boxes, phone boxes, planters and bike racks. Cars park along quieter streets but keep junctions clear.
- **Life** (visual only, never world state):
  - pedestrians walk the pavements and footpaths;
  - traffic drives the lanes and brakes for you and for the car in front;
  - pigeons peck on plazas and scatter with a flutter when you get close, coming back later.
- **Air**: chimney smoke and roof-vent steam, falling leaves, butterflies by day, fireflies and moths at night, golden-hour dust, and rain with splashes and wet, puddled streets.
- **Water**: moving ripples and glints.
- **Light**:
  - **Shadows**: baked sun shadows, long at golden hour.
  - **Night light map**: lamps, lit windows, porch lights, neon and car headlights.
  - **You**: a lantern and a torch beam where you face.
  - **Finish**: bloom, a colour grade per mood, and a vignette.
- **Cameras**: **oblique 3/4** or **perspective from the player**, switched with the camera button or **C** (also `?cam=persp`). Buildings are drawn live each frame through one projection, so both cameras share everything. People, cars, trees and buildings are depth-sorted. When a building hides you, you show as a see-through silhouette.
- **Sound**: generative music and ambience made live with Web Audio (no audio files). It has:
  - slow pad chords per mood;
  - sparse bell notes through a long reverb;
  - rain, wind gusts and city hum;
  - birdsong by day and crickets at night;
  - a wing flutter when pigeons take off.

  Turn it on with the 🔇 Music button; the choice is remembered.

## Performance and limits

- **Tiles**: ground, shadows and street props are baked into small tiles (8 cells) at device resolution and cached. Buildings, life and light are drawn live each frame.
- **Device resolution**: rendering is capped at 2× device pixels.
- **Breaking things**: breaking cells turns a building into a damaged ruin rather than punching a precise hole.
- **Not real obstacles**: parked cars and props are decoration; you can walk through them.
- **No turning**: the oblique camera doesn't rotate yet. The ground would need re-texturing at an angle so the pixel texels stay square.

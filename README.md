# GUN BROS ARENA — BUILD V18 · OUTLANDS

Source recovered from the published site on 2026-11-23 (UTC).

## Provenance

| Field | Value |
|---|---|
| Live URL | https://gun-bros-arena-1wkknf.freebuff.site/ |
| Site | Gun Bros Arena (created 2026-11-22T10:31:11Z) |
| Environment | production |
| Last deploy completed | 2026-11-23T19:42:11Z (receipt 73934df2-71b3-4f90-9ca4-297fdca2abda) |
| Build label (in code) | `const BUILD = 'v18 · OUTLANDS'` |
| Asset cache version | v22 (`game.js?v=22`, `style.css?v=22`) |

Recovered by downloading the files the service worker (`sw.js`) lists as the
complete game. Nothing was rebuilt, edited, or overwritten — these are the exact
bytes served by the live site.

## Files

- `index.html` — page shell, HUD/overlay markup, service-worker registration
- `style.css` — all UI styling
- `game.js` — the entire game, 8,888 lines, unminified ES module
- `vendor/three.module.js` — vendored Three.js (no CDN dependency)
- `manifest.webmanifest` — PWA metadata
- `sw.js` — offline cache service worker
- `icons/` — 192px, 512px and maskable 512px app icons

All textures, models and sound effects are generated procedurally in code, so
there are no image or audio asset files to miss.

## Content inventory (from game.js)

- **Maps / arenas (8):** Forward Base, Ruined District, Ironworks, Bokor Jungle,
  Dust Compound, Scorched Waste, Frozen Expanse, Molten Core
- **Weapons (8):** MK.1 Sidearm, Ripper SMG, Boomstick, Marauder AR, Photon Lance,
  Widowmaker, Ion Tempest, Annihilator — each upgradable to rank 5
- **Dinosaurs (8):** Velociraptor, Dilophosaurus, Ankylosaurus, Spinosaurus, T-Rex,
  Nightmare Raptor, Nightmare Alpha, Alpha Velociraptor
- **Playable bros (4):** Francis, Percy, Jet, Dozer — each with an ability, rank 4 max
- **Armour tiers (5):** Field Fatigues → Brotherhood Exo
- **Achievements (18)**, 50-wave campaign, airstrike and medkit purchases

## Running it

No build step. Serve the folder over HTTP (ES modules and service workers do not
work from `file://`), for example:

    python3 -m http.server 8000

Then open http://localhost:8000/

## Not included

The original project directory, its Git history, and any editor/tooling config.
This is the published build's source, which for this static game is the whole
program.

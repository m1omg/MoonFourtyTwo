# Notes for agents (contains spoilers)

**Owner: don't read past this heading.** Everything below is folded away and spoils the whole
game. The spoiler-free summary of these fixes is in `docs/fixes-2026-10.md`.

**Agents and other tools: read the rules below before using this file.**

- The owner is playing the game and wants to stay unspoiled. Never tell them the story, the
  twist, the endings or the cosmology. Never tell them what the creatures are or the rules they
  follow, or any puzzle solution (valve order, keys, eons, the bus, the stove). Never give
  chapter titles or plot past where they have played.
- When you report to the owner, say "chapter N" or "a later chapter", and describe a bug by what
  it did ("a pursuer could walk through walls"), not by what it means in the story.
- Commit messages, PR text and owner-facing docs must be spoiler-free too. Spoilers live only
  here and in `docs/sealed-design.b64` (gzip + base64; decode it with
  `base64 -d docs/sealed-design.b64 | gunzip`).
- As of 2026-10-05 the owner has seen the first pub (reality 1) and the first dark scene
  (reality 2, the frozen pub), and nothing later.

<details>
<summary>Spoilers: open only if you are an agent working on the code</summary>

## The game in one paragraph

Billions of years into the Dark Era, "you" and Ežo are the last bound pair: positronium spiralling
inwards. The pub night is the memory they carry, and each round of drinks is one orbit. The
creatures ("fluktuácie") are Boltzmann-brain imitations of the memory; their touch is OKNO (a
blackout). In the true ending the final clink annihilates the pair into light, and conformal
cyclic cosmology turns it into the next Big Bang. The full design is in the sealed file.

## Map of realities (code in `src/realities/`)

| id  | title                 | threat (rule)                                                                     | progress                                                                        |
| --- | --------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| r1  | Piváreň U Kolesa      | none                                                                              | rounds with Ežo → glyph over the WC → WC knocking → swap                        |
| r2  | (same module, frozen) | Jano and Fero move when unobserved (`Watcher`)                                    | sit with Ežo → Vierka hands you the keys at the bar → front door → r3           |
| r3  | Nekonečná piváreň     | waitress (`Staff`): ignores seated guests with a glass                            | Ežo's table (lighter, Horský čaj) → SKLAD door at ≥ 1.0 ‰ or reveal             |
| r4  | Pivnica a kotolňa     | `Hisser` hunts by sound; steam stuns it                                           | logbook → valves end-beginning-middle (3-1-2) → pipe                            |
| r5  | Kúpele                | lifeguard (`Lifeguard`) moves only in water                                       | PREPAD/VÝPUST valves, key from the chair, dive-hall vortex                      |
| r6  | Sídlisko              | neighbours (`Neighbor`) in the dark, on their landing only                        | intercom → caretaker's key → lift panel at ≥ 1.0 ‰ → ∞                          |
| r7  | Hotel Ďumbier         | chambermaid (`Chambermaid`): erases things, opens a hiding spot she saw you enter | 3 keys (1906, 10^14, tallies rooms) → salónik → window                          |
| r8  | Údolie kostí          | frost figures (`FrostFigure`) move when not lit                                   | barrels, flashlight → shelter → drink Čierne (eon)                              |
| r9  | Nočný spoj            | flicker rule (don't look at faces), inspector (`Inspector`)                       | ticket (by Ežo's cap) → validate → STOP at Konečná                              |
| r10 | Tiché more            | crawlers (`Crawler`) when you stand still; water = OKNO                           | 3 Čierne → 3 eons align the lights → light path                                 |
| r11 | Posledná runda        | shades (`Shade`); they rush if the stove dies                                     | talk → 90 s siege (burn pub objects) → choice: clink (r12) / stay (stay ending) |
| r12 | Svetlo                | none                                                                              | cinematic → walk into the pub → sit → credits                                   |

## What this pass changed and why (honest, with spoilers)

**r1/r2 pub (`src/realities/r01_pub/`)**

- **Blackout loop.** The nav grid's WC rect touched the room's edge cells across the shared
  wall, so the watchers walked through it. The closed WC door also wasn't in the nav. After the
  r2 talk the checkpoint was still `frozen`, inside the WC, with the watchers awake at once, so
  OKNO repeated forever.
  - The strip along the wall is cleared and only the doorway connects. The door cell is toggled
    by the door state, and the stall's cells by the stall door.
  - New checkpoint `frozenTable`: beside Ežo's table, facing the regulars. The watchers go back
    home and wake after 3 s; the lights stay steady for 9 s.
  - Old saves pointing at `frozen` with `pub.r2talk` set are moved to `frozenTable`.
- **The WC is furnished** (`wc.ts`): a bowl with a high cistern in the stall, a urinal on the
  north wall, a washbasin under the mirror, a bin, a drain and a "WC" plate outside, all
  procedural. The stall grew to x −9…−7.8, z −1.5…0.2. Its 0.7 m door is hinged by the side wall
  at x −7.85 and opens inwards, clear of the bowl. In the nav, the bowl row and the corner behind
  the short wall stay blocked, so `stallCells` holds only the three cells in front of the bowl.
  The basin and urinal cells are blocked too, because entities don't collide with props.
- **Dropped talks.**
  - `r2Talk` and the glyph remark ran through `solo()`, which silently does nothing while busy.
    Ežo repeats "Neboj sa… Sadni si" back to back near the chair, so sitting mid-line dropped
    the talk and you sat forever. That is very likely the owner's "same lines without
    progression". `soloWhenFree()` now waits for the line to finish.
  - The glyph trigger now waits for `!s.busy`.
  - Ežo can also be clicked in r2 (`ezo2`). After the talk he reminds you of the keys.
- **Progression.**
  - The glyph also triggers after 4 rounds or 9 min (was 14 min). It stays visible at 0.7
    opacity once Ežo points it out; before, it could be pointed at while invisible below 1.0 ‰.
  - After the glyph, Ežo stops auto-ordering and nudges you towards the WC (`e_nudge`).
  - One new line after each of rounds 1–5 (`e_roundN`).
  - "Dopi" (drink up) now comes _before_ you have drunk, as a nudge; "No vidíš. A je dopité."
    comes after.
- **Rounds.**
  - Auto-ordered rounds wait on the counter (`counterRound`, visible glasses, "Vziať rundu"), as
    Vierka's line says. Before, they went straight into the inventory.
  - A toast with only one glass left no longer gives a phantom drink (`e_ahead`).
  - The patrons' glance timer moved from `setTimeout` to sim time.
- **Glasses.** The player's mug follows the inventory (`setMugFill`). A shot glass sits on our
  beer mat for shot rounds, and Ežo's mug drains as he sips.
- **Vierka.** She got a procedural apron with a key ring (her generated model has none, but the
  keys are "zo zástery"). The ring hides once taken.
  - You ask, she hands them over (owner's requests, 2026-10-07/08): walking up to the bar
    within 2.4 m of her (or "Vypýtať si od Vierky kľúče") runs `vierkaGivesKeys()`. You get
    `pub.keys` at once and it is **saved at once** (`saveCheckpoint(cp, evenNearDanger)`):
    before, an OKNO on the way to the door reloaded a save without the keys, which read as
    "the keys can't be taken". Then `t_ask_keys` (you ask), she unfreezes, `v_keys`, the ring
    slides onto the counter, a toast, `t_keys`. Tested in `tests/e2e/frozen-pub.spec.ts`
    (keys survive an alcohol OKNO with `&saves`).
  - Opening the front door with the keys puts the watchers to sleep and stops the flicker:
    Fero's seat is 1.4 m from the door, so the exit (which takes a few seconds of lines and a
    fade with your back to them) was a near-certain catch.
- **Watchers seen = on screen.** `isObserved` used a fixed 35.5° cone while a 16:9 screen
  shows ~52° to each side, so the regulars glided in plain sight at the screen's sides. It now
  tests the camera's frustum (`onScreen` in `src/sim/ai/observe.ts`, unit-tested). This also
  applies to the r5 lifeguard and the r11 shades. Watchers also keep 0.8 m apart (`others`):
  a step into the other is taken back, so they queue instead of walking through each other.
- **Doors.** The WC lamp sat in the plane of the cubicle door, which left the door unlit
  (black); it hangs mid-room now. The pub side of the WC door was black too (dark wood, far
  from every pendant): the WC and street doors are worn veneer (`counterTop`), and a sconce
  (`wcSconce`, its globe among `lampMeshes`) lights the door and the "WC" plate. `Door` takes
  an optional `uvScale` so the texture tiles like the walls instead of stretching.

**Characters (`src/npc/Character.ts`)**

- `armDrop` is measured from the bind pose. Both rigs hold their arms only ~22° out, so the
  fixed 48° A-pose drop buried the arms in the body; this showed on every standing character
  (Vierka, the r3 waitress, Ežo in r4, r6 neighbours, the r9 inspector, the r11 shades).
- `holdOnTable()` attaches Ežo's mug from the posed skeleton: upright on the table, 0.15 m in
  front of the fist. Used in r1, r3 and r7 (table tops 0.834 / 0.834 / 0.762).

**Other realities**

- **r3:** picked-up stale glasses are hidden from the instanced mesh (`hideInstancesNear`) and the
  table loses its "has glass" protection. "Sadnúť si s pohárom" now also puts down a fresh beer.
- **r4:** solving the valves saves `boiler`, so a death on the way to the pipe no longer resets
  the puzzle.
- **r7:** each salónik key pickup saves `book` (keys used to be lost on OKNO). The chambermaid's
  nav now cuts the lobby side walls (keeping the z 4.5–9.5 openings), the reception counter, the
  lounge, the restaurant tables, the grandfather clock, and every room's wardrobe, bed, table
  and 1986 cabinet. Her cleaning spots (`r.stand`) stay walkable. Room doors still open in front
  of her.
- **r9:** at Konečná, Ežo's "Stlač to tlačidlo" repeats every 30 s after 40 s; the bus never
  stops on its own.
- **r10:** there are exactly 3 Čierne for 3 eons. Drinking one during a running eon lost it
  (softlock); now it goes back into the inventory.
- **r12:** the clink sound used the mug's bone-local position; it now uses its world position.

**Engine-wide**

- **Pointer lock** is only requested while the tab is visible and focused. It is released on
  blur or hide, and the game pauses and audio is suspended. A load that finishes in the
  background opens the pause menu instead of locking.
- **Voices:** Opus copies plus MP3 fallback (`voiceUrl` returns a list; `AudioSystem.loadFirst`).
  Only `e_intro2` and `e_intro3` are recorded; all other lines are subtitles only.
- **Skips:** a click in the first 0.4 s of a line doesn't skip it.
- **Grain** (`GradeEffect`): a pcg3d integer hash on `gl_FragCoord`, applied on a square-root
  scale. The sine hash on `uv * 1024` banded on some GPUs.

## Checked and found sound (no change needed)

- **r5:** the absinthe path is optional (you can wade); Ežo's hints match the state.
- **r6:** the demijohn gives slivovica without limit, so the drunk-only lift panel can't
  softlock.
- **r7:** keys are not erasable.
- **r8:** Čierne is saved on pickup.
- **r11:** fuel is 8 × 0.3 against a 1.15 deficit. If the stove dies the shades rush, you die and
  retry with the fuel reset.
- **Respawn points vs. threat start positions:** checked in every reality.

## Known gaps and risks

- Not verified on real hardware: the grain on Mesa or other real GPUs, Vivaldi voice playback,
  and pointer lock in Vivaldi.
- r5's WALK cells cross walls in many places. Harmless today because only the water-bound
  lifeguard uses that nav; re-check if a walking entity is ever added there.
- r7 room doors are crossed by the nav (by design: she opens them, see `r07_hotel/index.ts`
  tick).
- The finished game leaves the save on the last checkpoint, so Continue replays the epilogue or
  the stay ending.
- Ežo's beer mug is used for shot toasts too (he sips beer while you take the shot).

## Tools that helped

- **Debug hash:** `#r1:frozenTable&test&q=med&seed=11&fly&god`. `test` exposes
  `window.__mf42` (`sim`, `step`, `teleport`, `aim`, `use`, `info`, …), and the dev server also
  exposes `window.game`.
- **Nav-through-walls check:** for every pair of neighbouring walkable cells, raycast between
  their centres at y = 1.0 with `game.world.raycast`. A hit means a creature can path through
  geometry. Door cells (`Area.DOOR`) are skipped.
- **Screenshots:** headless Chromium with `executablePath` left to `PLAYWRIGHT_BROWSERS_PATH`,
  `--use-angle=swiftshader`. Under SwiftShader, `step` renders frames slowly; use `sim` to
  advance.
- **Regression tests:** `tests/e2e/frozen-pub.spec.ts` covers the blackout loop and the
  mid-sentence sit.

</details>

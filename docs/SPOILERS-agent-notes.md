# Notes for agents (contains spoilers)

**Owner: don't read past this heading.** Everything below is folded away and spoils the whole
game. The spoiler-free summary of these fixes is in `docs/fixes-2026-10.md`, and where the
work stands is in `docs/HANDOFF.md`.

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
- As of 2026-10-09 the owner has seen the first pub (reality 1) and the first dark scene
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

**6–7 October (from the commit history; the later passes below build on these)**

- `c81dc37`: Ežo's mug stands on the table and is lifted to his mouth only while he drinks.
- `9d787e5`, `407b412`: two sessions fixed the same pub reports; the merge kept the other
  session's waking at Ežo's table plus this one's save slots, drink animations and menu fix.
- `b792478`: save slots. „Uložiť hru" copies the last checkpoint into one of three slots; the five
  most recent checkpoints are kept automatically (`src/save/SaveGame.ts`); „Pokračovať" still
  uses the main save. Pause → main menu used to leave the loop paused.
- `4516246`: first-person animation per drink kind (shot, bottle, glass) and food (two bites).
- `58ef122`: a catch turns you towards the catcher and shows „Niečo ťa dostalo." (not the
  alcohol OKNO text). In r2 each catch slows the watchers a little, down to about the story pace
  (`r01_pub/index.ts`, "each time they get you"), and a creak gives away unseen movement.
- `c4b6632`, `2b353cb`: portrait play (controls above the hotbar, subtitles on top, FOV widened
  to ≥ 60° across). `96b6add`: the optional swipe-to-walk touch scheme.
- `e840dca`: r2 watchers at a third of their speed; a flicker moves them ~30 cm. After any
  OKNO nothing moves until you step 1.5 m from where you woke (`Game.respawnHold`, all
  chapters). Its "save waits near danger" part was undone on 10-08: saves are immediate.
- `d2060f4`, `a9b831d`: Vierka hands over the keys herself; the WC is furnished (see below).

**Engine-wide fixes from the October audit (2026-10-08)**

- **Saves are immediate.** The `dangerNear` deferral is gone: a respawn always uses the
  checkpoint's fixed pose and every reality rebuilds its threats, so holding saves back only lost
  progress (r4 valves, r7 keys, r10 eons, r2 keys). A drink still on its way down is saved as not
  drunk (`snapshot()`), so a blackout mid-sip never eats a story drink.
- **Inventory never refuses.** Past six kinds a slot is added (keys 7–9, wheel cycles) and
  removed again when emptied; `add()` returns `true` always. Before, a full hotbar silently
  deleted pickups (r8/r10 Čierne = unfinishable chapters).
- **Missing chapter files after a deploy** (`force_orphan` deletes old hashed chunks): the
  import is caught, the game saves pointing at the target chapter and reloads; `boot()` resumes
  straight into it (sessionStorage `este-jedno.resume`, a loop guard of 60 s) and opens the pause
  menu so the first click grabs the mouse and starts the sound. A WebGL context loss does the same.
- **Modals.** No pause over endings, documents or choices (`ui.modal`, `ui.choosing`); Resume
  restores the input state from before the pause and clears latched presses (the Esc/Enter that
  were pressed in the menu); documents clear them too. `disposeReality` cancels an open choice
  (`ui.cancelChoice`, resolves −1) and `choose`/`readDocument`/`say` throw `Cancelled` if the clock
  generation changed while they waited, so an old chapter's script never runs on in the next one.
  `titleScreen()` disposes a loaded chapter (endings). Credits let the mouse go. Choice keys use
  `e.code`. New game asks first when a game is saved. "Uložené" shows in the pause menu itself.
- **Per-chapter state reset on dispose:** drink in flight, `fx` (white, frost, warp, …), reverb.
- **Lighter vs torch:** only the lighter (`lightPower <= 1`) blows out while sprinting, with a
  click and a one-time hint naming the bound key. Prompts show the bound interact key.

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
    `pub.keys` at once and it is **saved at once** (`saveCheckpoint` never defers any more):
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
- **Pub audit (2026-10-08).**
  - **The front door was unreachable** from inside (and in r12 the room from the street): the
    stove, the round table's square AABB, Fero's full-body box and the chalkboard's rotated
    AABB closed a ring round the door pocket (widest gap 0.19 m, the capsule needs 0.64). In r2
    the door prompt focused only from a 0.7 × 0.8 m patch by the regulars. Now: the chalkboard
    stands against the north wall at (−2.2, 3.95) with an exact rotated collider; round tables
    have a 12-sided cylinder collider (r 0.53); a wooden sill fills the 10 cm floor gap under
    the doorway. `tests/e2e/walkways.spec.ts` flood-fills the player's capsule over the real
    colliders (`capsuleReachable` in `src/sim/physics/reach.ts`, `__mf42.reachable`/`reachMap`):
    table → door in r1 and r2, inside → square in r1, square → seat in r12.
  - **Regulars' bodies.** No static boxes any more (they stayed where the regulars started,
    blocked the door and hid each regular's own sample points from `isObserved`, so they glided
    out of their seats in plain view on every wake). Each has a 0.6 m `DynamicBody` that follows
    the watcher and has `sight = false` (rays pass, capsules don't). Head sample at 1.15 m.
  - Watchers turn only in `creep`/`return` (they swivelled to face you while asleep), are
    interpolated by `alpha`, wake only once you are ≥ 3 m from both (`wakeWhenClear`, also after
    the 3 s post-OKNO hold), and catch only with line of sight (no catches through the shut WC
    door or the stall wall). Door cells close the moment a door starts shutting, and any nav
    `set` bumps `NavGrid.version`, which makes every entity re-plan its path.
  - Keys only after `r2Talked` (you could skip the rule and the juniper hint). The key toast
    shows when she hands them over, not before you ask.
  - **Keys after a catch (owner's report, 2026-10-09).** After an OKNO Ežo's two-line reminder
    held `busy` ~11 s; asking Vierka then saved `pub.keys` and hid the prompt, but the exchange
    queued behind him, so the regulars got you meanwhile and you woke with keys you were never
    told about. Now the exchange plays at once (`s.keyScene`: it supersedes his line, his
    reminder stops, `solo`/`soloWhenFree` wait for it, the watchers sleep until it ends and then
    `wakeWhenClear`). With keys, the post-OKNO toast says so, Ežo says `e_r2_6`, and the door
    prompt reads "Odomknúť kľúčmi". Test: the third case in `frozen-pub.spec.ts`.
  - `soloWhenFree` is a real queue (several waiters, no 15 s drop); `t_frozen`, `t_door_open`,
    `t_knock` and `t_stall` go through it (`pub.frozenSeen` is set after the line played).
  - Exit: `s.leaving` disables the door prompt and stops wakes and flicker.
  - WC scene: once the glyph is up, being in the WC > 1.2 s, > 1.3 m from the hinge, with the
    door open and not opened by you in the last 2.5 s, shuts it (again, if needed); the knock
    starts once it is shut with you inside. Before, a peek in and out shut it with you outside
    and nothing ever happened again.
  - `reduceFlashes`: r2's flicker dims to 45 % instead of black (gameplay unchanged).
  - Small ones: Vierka posed before freezing (after reloads), jukebox screen reset and neon
    glow off in r2, crowd mug on the long table at its real height, soap in a wall dish, cellar
    hatch `ignoreOcclusion`, cash register on the counter, the stool strip blocked in the nav,
    intro hints name the bound keys, `Game.say` waits at most 2.5 s for a voice clip.

**Characters (`src/npc/Character.ts`)**

- **Hands at the table (2026-10-08).** Seated with `armOnTable`, both forearms were turned in
  ~30°, so the hands crossed: Ežo's left hand lay over his right and in his mug (measured from
  the skinned vertices: 3 mm apart, fingers 2–4 cm inside the glass). `POSE_SIT_TABLE` (left
  forearm +6°) and `ARM_REST` (right forearm 8°) keep them ≥ 5 cm apart even mid-gesture;
  `holdOnTable` reach is 0.18 and the free-hand `mugRest` 0.13/−0.08 (r5), so no fingertip is in
  the glass. Seated characters without a table keep the old `POSE_SIT`. The cigarette pack moved
  in front of his left hand (the table is only 0.56 m wide). `root.userData.character` links the
  scene graph to the Character for probes.

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

**October audit, chapters 5–8 (2026-10-08)**

- **r5:** the key and the dive-door unlock save at once (new checkpoint `dive`, just inside the
  diving hall, on unlock). After VÝPUST, stepping or slipping off the springboard over the dive
  pool runs `jump()` (before VÝPUST deep water is still OKNO). The lifeguard is put back at his
  dive point (`return`) if the flood strip drains under him (he was stranded on dry nav). Lane
  rope follows the pool level; the drain noise stops when the pool is empty; `t_board` only after
  VÝPUST; `t_key` near the chair and `t_rope` at the rope finally play; the mosaic is disabled
  while Ežo talks. Pool walls stop 4 mm under the deck (`RIM`, rim z-fight); the diving hall's
  west wall strip 9–11 m is closed.
- **r6:** floor 0 gets a terrazzo slab under the stairs and a wall closing the space under
  flight B from the landing (a step past the lift dropped you into the void). The estate ground
  plane uses `polygonOffset` (it z-fought the ground floor). Lift motor loops stop in `finally`
  (a blackout mid-wait left them running for ever); calling the lift shuts its door on the floor
  it leaves; the panel can't open two choices (`panelBusy`). Thoughts (`line`) wait out Ežo on
  the intercom; calling him again before you have the key repeats `e6_2`. The cabin lamp and
  the flats' lamps only shine while their door is open or you are inside (they lit "dark"
  landings through walls). The snow drift no longer pokes into the vestibule.
- **r7:** items stand on the tables' real tops (`topOf` raycasts the placed model: the 1906 key
  and glasses floated 21–23 cm, the 1986 table stood 1 m high and hid its things, 10¹⁰⁰'s shots
  were inside the board); 1986's table is scaled 0.79; the watching room's mug uses 0.834. The
  maid is parked (`active = false`) during Ežo's salon talk; her knock call plays only within
  12 m and never over Ežo; `c_found` goes through `line()`. Salon unlock saves. Key board and the
  corridor sign moved onto the wall face (z 0.105). The cart starts in front of her (`place`
  override). Mirror-ball specks land on the walls' faces. 1986 cabinet + TV moved 0.25 m off the
  bed. Nav: room-table cuts ±0.95 × ±0.5, the stage is cut. Restaurant tables and the lobby
  coffee table have legs. `t_watching2` waits 4.4 s.
- **r8:** `isLit` counts the shelter tube (within 8 m while on) and barrels within 8 m (was
  6.5); the carried light's reach is shared with the renderer (`src/sim/lightReach.ts`: lighter
  6 m in a 0.55 cone, torch `torchReach(level)` in the beam's half angle, pitch included).
  Batteries add up to a charge of 2 (one found before the torch was lost). The eon clears the
  flash, stills the figures, returns 0 threat/darkness, blocks the light key and switches the
  carried light back to the lighter (`giveLight(1)`); r9–r11 also reset a carried power > 1.
  The sky flash swells softly with `reduceFlashes`. `mid` saves at z < −140 (either side of the
  road); `t_cierne_how` + the toast after 20 s at the shelter holding Čierne. Ežo's note is a
  paper on barrel 0 (the prompt sits on it). Terrain 450 m long (its edge showed); the bus has
  wheels; the shelter bench has feet.
- **Engine:** seated/hidden players stand up only on a move made after the movement input was
  released once (`seatMoveArmed`; hiding while holding W used to pull you straight back out).
  `Interactions` prefers targets the look falls on, and small ones (radius ≤ 0.25) over big
  ones around them (`tests/unit/interactions.test.ts`).

**Performance, same picture (2026-10-08)**

- Shadow maps are drawn once per frame: `shadowMap.autoUpdate = false` and
  `needsUpdate = true` before the composer (its scene pass draws them). With autoUpdate, N8AO's
  two transparency renders (it auto-detects transparent materials, so always) and r2's TV feed
  redrew them each time (29 shadow draws per extra render in the frozen pub).
- Characters are frustum-culled (main and shadow passes) with the bind-pose bounding sphere
  - 0.4 m (`Character` constructor); before, `frustumCulled = false` drew every character
    always.
- r2's TV feed renders only while the TV screen is in the camera's frustum.
- Measured (SwiftShader, high): r1 seated 366k → 308k triangles per frame; the frozen pub's
  extra renders no longer redraw shadows. Not done (would change the picture or the assets):
  a point-light cap on high, simplifying heavy props (street lamps 30k triangles each, stools
  14k, the cigarette pack 12k), merging small static meshes.

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

- **Commit messages that spoil.** The history was reworded spoiler-free once (force-push, with
  the owner's OK). Since then, `a80784c` and `7ed0e6c` (2026-10-08) name later chapters and their
  threats (the endless pub, the cellar, the night bus, the silent sea, the last round, the
  square, the waitress, the torch). Rewording them needs a force-push of
  `ccr-2a407a47-pkyyrs`. The safety classifier refused it without the owner's explicit
  permission. The owner was told and hasn't decided.
- **Small cosmetic issues found in the audit and left alone:**
  - r1/r2: the key ring on Vierka's apron sits below the counter's sightline. It doesn't matter
    for play, because she slides the keys over.
  - r6: a little light bleeds in the vestibule.
  - r7: the chambermaid grazes door frames when she turns through a doorway.
  - r7: a remark about the grandfather clock doesn't match the static model.
- **Performance offered, not requested:** a point-light cap on high; simplifying the heaviest
  props (street lamps 30k triangles each, stools 14k, the cigarette pack 12k); merging small
  static meshes. All of these change the picture or the assets, so they wait for the owner.

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
- **Regression tests:**
  - `tests/e2e/frozen-pub.spec.ts`: the blackout loop, the mid-sentence sit, keys kept across an
    OKNO, and keys right after a catch.
  - `tests/e2e/walkways.spec.ts`: capsule flood fill: table → door in r1/r2, inside → square,
    square → seat in r12.
  - `tests/e2e/pub-flow.spec.ts`: the r1 path, including the WC peek case.
  - Each chapter has a `*-flow.spec.ts`.
  - `smoke.spec.ts` loads the realities named in `REALITIES` (CI passes all but r2).
- **Test pitfalls:**
  - `__mf42.sim(s)` runs in one macrotask, so `runScript` continuations only run between
    `page.evaluate` calls. Sim in ≤ 0.5 s chunks whenever a line or scene has to progress.
  - A seated player stands only on a move made after a neutral input tick (`seatMoveArmed`).
  - Use `&saves` whenever a test reloads after an OKNO.
  - Without a running preview server, Playwright starts `npm run preview` itself (port 4173,
    `reuseExistingServer`).
  - Long-lived background servers in cloud sessions get killed by the time limit; let
    Playwright own the server.

</details>

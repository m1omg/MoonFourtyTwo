# Handoff: where things stand (25 October 2026)

Spoiler-free. Written so the work can carry on in a new session or from another account.

## State

- **Live game:** https://m1omg.github.io/MoonFourtyTwo/. It is built from
  `ccr-2a407a47-pkyyrs`.
- **Last code change (2026-10-25):** climbing over low edges works properly, and jumping is new
  (Space, rebindable). The owner couldn't get out of the water at the start of chapter 5 and
  asked for jumping.
- **Before that (2026-10-10):** `acdf52d`. On the owner's request, the long pub's pursuer got a
  little quicker and the hose level's creature a lot easier.
- **Owner's last reports:**
  - Stuck in the water at the start of chapter 5: fixed.
  - Where to go after the valves in the hose level: answered with a hint. Nothing was broken.
    The way on is easy to miss; making it clearer was offered.
- **Not done yet:** check that CI passed for the 25 October change, then update this file.
- **In progress:** nothing. Every session branch is merged into `ccr-2a407a47-pkyyrs`; there
  are no open pull requests or issues.
- **Owner's progress (2026-10-25):** the pub and the frozen pub, the long pub (r3, their
  "level 2"), the level with the hose (r4, their "level 3"), and now chapter 5. Nothing later
  may be spoiled.
- **Tests:**
  - 117 unit tests in 25 files.
  - 39 browser tests in 18 files, run on a desktop and a mobile setup. Two are skipped by
    design.

## What changed in October

All of it is in `docs/fixes-2026-10.md`, written for the owner without spoilers:

- The bugs the owner reported, and their causes.
- A full audit of the game, with fixes in every chapter.
- New features:
  - save slots;
  - playing with the phone held upright, and an optional swipe-to-walk touch scheme;
  - a furnished pub toilet;
  - an animation for every drink and food;
  - mouse-button bindings.
- Faster drawing with the same picture.

## Open items

None of these is blocking, and none is started.

1. **Two old commit messages mention later chapters.** They are `a80784c` and `7ed0e6c`; the
   owner shouldn't read them.
   - Rewording them means force-pushing `ccr-2a407a47-pkyyrs`. That is a history rewrite, and
     it needs the owner's explicit OK.
   - The game is not affected either way.
2. **Further performance work, optional.** It would change the picture or the models a
   little, so it waits for the owner to ask:
   - limit the number of point lights on the high preset;
   - simplify the heaviest models (street lamps, bar stools, the cigarette pack);
   - merge small static meshes.
3. **Small cosmetic issues left alone:** one in chapter 2, one in chapter 6 and two in
   chapter 7. The details are in the agent notes.
4. **Not checked on real hardware:**
   - the film grain on a real graphics card;
   - voices and mouse capture in Vivaldi on Linux.
5. **CI warning, not failing yet.** GitHub is retiring Node 20 for actions; the `@v4`
   actions in `.github/workflows/ci.yml` (`checkout`, `setup-node`, `upload-artifact`,
   `download-artifact`) are being forced onto Node 24. Moving them to their newer major
   versions would clear the warning.
6. **Browser tests run on Ubuntu 24.04 (2026-10-25).** `ubuntu-latest` moved to 26.04, where
   Playwright 1.56 won't install its browser, so the `e2e` job is pinned to `ubuntu-24.04`.
   Upgrading Playwright would let it move back.

## Continuing from another Claude account

1. **GitHub access.** The new account needs push access to `m1omg/MoonFourtyTwo`:
   - connect the same GitHub account in Claude (or one added to the repo as a collaborator);
   - make sure the Claude GitHub App is installed on the repo.

   Without push access, nothing reaches the live site.

2. **Start the session on this repo.** `CLAUDE.md` loads automatically. It holds the rules:
   - merge into `ccr-2a407a47-pkyyrs` and push after every change;
   - no spoilers;
   - never break the owner's save;
   - refresh-rate independence;
   - no paid generation.

   A first message like "Read CLAUDE.md and docs/HANDOFF.md, then …" gets a new session up to
   speed.

3. **Branches.** The new session gets its own working branch. That's fine: per `CLAUDE.md` it
   merges into `ccr-2a407a47-pkyyrs` and pushes. Every `ccr-*` push deploys, so it must not
   push a branch that is behind `ccr-2a407a47-pkyyrs`.
4. **Your saves.** They live in your browser's local storage for the game's site. Switching
   Claude accounts doesn't touch them, but clearing the site's data in the browser would.

## Where to find what

| File                           | For                                                           |
| ------------------------------ | ------------------------------------------------------------- |
| `CLAUDE.md`                    | Rules and workflow (loaded automatically by Claude Code)      |
| `README.md`                    | What the game is, controls, development commands              |
| `docs/HANDOFF.md`              | This file: state and open items                               |
| `docs/fixes-2026-10.md`        | Everything fixed or added in October, spoiler-free            |
| `docs/asset-ledger.md`         | Paid generations and credit balances                          |
| `docs/SPOILERS-agent-notes.md` | Technical notes for agents. **Spoilers: the owner skips it.** |
| `docs/sealed-design.b64`       | The full story design, deliberately encoded. **Spoilers.**    |

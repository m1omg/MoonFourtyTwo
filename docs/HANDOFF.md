# Handoff: where things stand (9 October 2026)

Spoiler-free. Written so the work can carry on in a new session or from another account.

## State

- **Live game:** https://m1omg.github.io/MoonFourtyTwo/. It is built from
  `ccr-2a407a47-pkyyrs`.
- **Last code changes:**
  - `dde06a0`: the keys fix in chapter 2.
  - `f753147`: controls can be bound to the middle and side mouse buttons, and the side
    buttons no longer take the browser out of the game. This one came from a parallel session.
- **CI:** both commits passed the whole run: build, unit tests, deploy and all browser tests.
- **Owner's last report:** after the two regulars caught you, Vierka wouldn't give you the keys.
  It is fixed, and the owner confirmed it works.
- **In progress:** nothing from this session. Everything it did is merged into
  `ccr-2a407a47-pkyyrs`. If another session is still open, check it before starting new work.
- **Owner's progress:** chapters 1 and 2 (the pub and the frozen pub). Nothing later may be
  spoiled.
- **Tests:**
  - 103 unit tests in 23 files.
  - 38 browser tests in 18 files. Two are skipped by design, and the rest pass on CI.

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

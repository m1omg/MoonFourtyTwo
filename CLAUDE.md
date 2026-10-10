# Working on this repo

- **Always merge and deploy.** After every change: run `npm run check` (plus the relevant
  browser tests), then merge the work into `ccr-2a407a47-pkyyrs` and push it. That branch's CI
  builds and publishes to GitHub Pages. Don't ask first; the owner wants this every time. Check
  that the CI run and the deploy succeed, and fix them if they don't.
- **No spoilers for the owner.** They are playing the game. Story, endings, creature rules and
  puzzle solutions must never appear in chat, commit messages or owner-facing docs. Read
  `docs/SPOILERS-agent-notes.md` (agent notes; spoilers folded away) before working on any chapter.
- Gameplay must stay independent of the display's refresh rate: fixed 60 Hz simulation, render
  interpolation, look deltas never scaled by frame time.

**Start here:** `docs/HANDOFF.md` has where things stand, the open items and how to pick the
work up in a new session or account.

## The project

„Ešte jedno": a first-person horror adventure for the browser (three.js + Vite + TypeScript,
Slovak UI and subtitles). Live at https://m1omg.github.io/MoonFourtyTwo/. Twelve chapters
(`src/realities/r01_pub` … `r12`, plus `r0` for the intro). The owner plays the live site.

## The owner's rules

- **Never break their save or their game.** They are playing for real. Old saves must keep
  loading: when a checkpoint moves or is renamed, migrate it (see `frozen` → `frozenTable` in
  the pub) instead of invalidating it. Check save/continue with the `&saves` flag.
- **Talking to the owner:** they usually write in Slovak; answer in the language they write in.
  Refer to chapters by number ("chapter 3", "a later chapter"), never by title. As of
  2026-10-10 they have played the pub and the frozen pub (r1), the long pub (r3) and the level
  with the hose (r4), and nothing later. They call r3 "level 2" and r4 "level 3".
  Update that line in `docs/SPOILERS-agent-notes.md` when they say they've moved on.
- **No paid generation** (Higgsfield, Krea) unless the owner asks for it in that conversation.
  Krea is not used any more (it overran its budget); Higgsfield is not used for voices. Log any
  spend in `docs/asset-ledger.md`. Prefer procedural geometry in code (the pub's toilet,
  Vierka's apron).
- Commit messages describe the change in player terms, spoiler-free, and never name an AI model.
- Owner's general preferences: don't be presumptuous; keep Linux advice simple.

## How to work

```bash
npm install
npm run check                      # lint + typecheck + unit tests (about a minute)
npm run build                      # e2e tests run against the built dist/
npx playwright test tests/e2e/frozen-pub.spec.ts   # starts `npm run preview` on :4173 itself
```

- Browser tests use SwiftShader and are slow (the full suite takes about 11 minutes with two
  workers). Run the specs for the chapter you touched; CI runs everything.
- Debug hash: `#r1:frozenTable&test&saves&q=low&seed=5&god&fly&stats`. It picks the chapter and
  checkpoint (see `src/app/debug.ts`). `test` gives manual stepping and `window.__mf42` (`sim`,
  `move`, `teleport`, `aim`, `use`, `info`, `reachable`, `reachMap`, `setBac`…; see
  `src/app/testApi.ts`), and `window.__game`.
- **Test gotcha:** `__mf42.sim(s)` runs inside one macrotask, so the game's async scripts (lines,
  scenes) only continue between `page.evaluate` calls. When a script has to progress, sim in
  chunks of 0.5 s or less (see `until()` in `tests/e2e/frozen-pub.spec.ts`).
- **Test gotcha:** a seated player stands up only on a move made after the movement input was
  released once. Tests send a neutral tick before moving (`standUp` helpers).
- Story scripts run on the sim clock (`game.clock.wait/until`, `Cancelled` on chapter change).
  Never use `setTimeout` for gameplay.

## CI and deploy

- `.github/workflows/ci.yml`, on every push to `main` or `ccr-*`:
  - The `build` job runs lint, types, unit tests, the build and the asset budget.
  - `deploy` then publishes `dist/` to `gh-pages` (`force_orphan`).
  - `e2e` (all browser tests) runs in parallel with `deploy`.
- The site goes live even if `e2e` fails, so check that job too.
- Any `ccr-*` push deploys. Pushing a branch that is behind `ccr-2a407a47-pkyyrs` puts an older
  game online, so bring your branch up to date with it first.
- In cloud sessions there is no `gh` CLI; use the GitHub MCP tools (`actions_list`,
  `actions_get`, `get_job_logs`) to watch runs.

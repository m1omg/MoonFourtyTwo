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

# Ešte jedno

A first-person horror adventure for the browser (three.js). It starts as an ordinary evening of beer and shots with your friend Ežo in a small-town Slovak pub. Then the pub stops being what it seems.

- **Play:** https://m1omg.github.io/MoonFourtyTwo/. Desktop uses keyboard and mouse (gamepad works too); phones and tablets get touch controls in landscape.
- **Language:** Slovak (UI, subtitles, voices).
- **Content:** 18+ fiction with horror, sudden scares, flashing lights and drinking.
- **Comfort:** the settings can tone down camera motion and the drunk view, make flickering lights burn steady („Obmedziť záblesky"), enlarge subtitles and switch to the gentler „Príbeh" difficulty.
- **Collectibles:** twelve beer mats with Ežo's notes are hidden along the way; the pause menu counts them.

## Controls (desktop)

| Key           | Action                  |
| ------------- | ----------------------- |
| WASD / arrows | move                    |
| Shift         | sprint                  |
| Ctrl / C      | crouch                  |
| Mouse         | look                    |
| E / LMB       | use, talk               |
| Q / RMB       | drink the selected item |
| 1–6 / wheel   | pick a drink            |
| F             | lighter / flashlight    |
| G             | throw                   |
| Esc           | pause                   |

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm run check        # lint + typecheck + unit tests
npm run build && npx playwright test   # headless smoke tests (SwiftShader WebGL)
```

The URL hash accepts debug flags, for example `#r3:cp2&q=low&bac=1.5&god&fly&stats`. They pick the reality and checkpoint, quality, starting ‰, invulnerability, noclip and a stats overlay. `&test` switches to deterministic manual stepping for Playwright (`window.__mf42`).

The simulation runs at a fixed 60 Hz and rendering interpolates, so gameplay is identical at any display refresh rate. `tests/unit/loop.test.ts` and `tests/unit/controller.test.ts` check this. Dynamic resolution learns the display's own pace, so a 30 Hz screen is not mistaken for an overloaded one (`tests/unit/resGovernor.test.ts`).

On the low preset (phones), models are capped at 9000 triangles and 512-pixel textures (256 for small props), glass is drawn without refraction, and far furniture in the big hall uses simplified copies.

## Deploy

Every push to `main` or a `ccr-*` branch runs CI. CI then publishes `dist/` to the `gh-pages` branch. One-time repo setting: Settings → Pages → _Deploy from a branch_ → `gh-pages` / root.

## Assets

- CC0 models, textures and HDRIs from [Poly Haven](https://polyhaven.com) and [ambientCG](https://ambientcg.com).
- Ežo's 3D model was generated with Higgsfield (Tripo image-to-3D + auto-rig). Other AI assets come from Higgsfield and Krea. Spending is tracked in `docs/asset-ledger.md`.
- `docs/sealed-design.b64` holds the full story design. It is deliberately encoded (gzip+base64) so the owner isn't spoiled.
- `docs/SPOILERS-agent-notes.md` is for agents working on the code: a map of every chapter, the fixes and known gaps. It contains spoilers (folded away under a warning), so the owner shouldn't read it.

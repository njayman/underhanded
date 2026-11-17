# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Underhanded: endless roguelike whack-a-mole for mobile. App ID `com.njayman.underhanded`. The folder name `whakawhaka` is only a dev codename.

- Run = 60-second "shift". Clear it and you drop one depth layer. No final level.
- Moles steal gold from Lower Gridley. They wear bowler hats, carry ledgers, file complaints.
- Layers are departments: Fungus Archives, Pipe Works, Gold Vault, Sewer Opera. v1 ships these 4, then cycles them at higher speed. Boss at the end of every layer.
- 3 lives per shift. Hitting a decoy (foreman) or missing a golden mole costs a life.
- Between shifts: draft 1 of 3 relics (tools) for next run. Gold carries over for permanent upgrades.
- Score = depth. Two leaderboards: daily (resets each UTC day) and all-time best depth.
- Daily seeded runs: same layout for everyone. Seed = UTC date string (e.g. `2026-11-16`) hashed into the RNG. Works offline.

## Tech stack

- TypeScript + Phaser (game), Vite (build), Vitest (unit tests), ESLint (typescript-eslint).
- Capacitor 8 packages Android and iOS from the Vite `dist/` output.
- Supabase: leaderboard backend, called with plain `fetch` (no SDK). Schema in `supabase/migrations/`. Configure with `.env.local` (git-ignored): `VITE_SUPABASE_URL=https://<ref>.supabase.co` and `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`. Without them the game uses a local stand-in board. Only the publishable key ever goes in the app, in the `apikey` header only (it is not a JWT, never a Bearer token).
- AdMob for ads; Google Play Billing and StoreKit via a Capacitor IAP plugin for purchases. Not installed yet.
- Saves are local only in v1. Cloud save is deferred.
- Min OS: Android 7.0 (minSdk 24) and iOS 15.0. Both are the Capacitor 8 defaults.
- Platform order: Android first. iOS follows only if Android succeeds. Keep everything iOS-compatible: no Android-only plugins or native code without an iOS equivalent, and platform differences stay behind `src/services`.

Why: Phaser handles sprites, input, and tweens for 2D. Capacitor wraps a web build, so one codebase serves both stores.

## Commands

Verified (run in this repo):

- `npm install`: install deps.
- `npm run build`: typecheck (`tsc --noEmit`) then Vite build to `dist/`.
- `npm test`: Vitest, one run.
- `npx vitest run tests/rng.test.ts`: single test file. `npx vitest run -t "name"` for one test.
- `npm run test:watch`: Vitest watch mode.
- `npm run lint`: ESLint on `src` and `tests`.
- `npx tsc --noEmit`: typecheck only.
- `npm run dev`: Vite dev server at http://localhost:5173/.
- Test the SQL locally (verified): `docker run --rm -d --name uh-pg -p 127.0.0.1:54329:5432 -e POSTGRES_PASSWORD=test postgres:17`, create roles `anon`, `authenticated` and `authenticator` (login, granted both), then `psql -h 127.0.0.1 -p 54329 -U postgres -f supabase/migrations/<file>.sql`. For HTTP, run `postgrest/postgrest` against it with `PGRST_DB_ANON_ROLE=anon`.

Not yet verified (TODO):

- `npm run preview`: TODO verify.
- `npm run cap:android`: opens Android Studio. TODO verify.
- Waydroid is installed but untested for this project.
- iOS: deferred. `npx cap add ios` not run. No Xcode on this machine.

Android build (verified):

- `npm run cap:sync`: Vite build, then copy web assets into `android/`.
- `cd android && ./gradlew assembleDebug`: debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`. Run `npm run cap:sync` first so the APK has the latest web build.
- `android/` is a committed native project (Capacitor convention), not generated output.

Run on the headless emulator (verified, AVD `Pixel_Tablet`, Android 15):

- Start: `~/Android/Sdk/emulator/emulator -avd Pixel_Tablet -no-window -no-audio -no-boot-anim -no-snapshot &`. Do not add `-gpu swiftshader_indirect`; boot hung with it.
- Wait until `adb shell getprop sys.boot_completed` prints `1`.
- Install: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
- Launch: `adb shell monkey -p com.njayman.underhanded -c android.intent.category.LAUNCHER 1`
- Web console output: `adb logcat -d | grep Capacitor/Console`
- Screenshot: `adb exec-out screencap -p > shot.png`
- Stop: `adb emu kill`

## Folder structure

```
index.html            Vite entry; loads src/main.ts
src/main.ts           boots Phaser
src/game/             Phaser scenes, game loop, input, hit effects
src/data/             mole, tool (relic), layer, boss definitions (data only)
src/generation/       depth layer generator (seeded, uses rules/rng)
src/rules/            pure logic: scoring, lives, rng. No Phaser imports.
src/meta/             between-shift progression, gold, upgrades, leaderboard client
src/services/leaderboard/  local stand-in board and Supabase provider
supabase/migrations/  leaderboard schema and functions
src/services/index.ts the live `ads` gate and `purchases`; the one place providers are chosen
src/services/ads/     AdService interface, AdGate, mocks. Only place ad SDKs are touched.
src/services/iap/     PurchaseService interface + mock. Only place IAP is touched.
src/ui/               menus, draft screen, results screen. Phaser scenes only, no DOM overlays.
src/art/              ink palettes per layer, halftone/misregistration fragment shader
assets/sprites|audio|fonts   raw assets
tests/                Vitest unit tests, mirror src/rules, src/generation, src/meta
```

How a shift fits together:

- `generation/depth.ts` `shiftConfigForDepth(depth)` picks the layer (cycling `data/layers.ts`) and scales speed.
- `rules/shift.ts` owns shift state: `createShift`, `tick(state, dt, cfg, rng)`, `whack(state, hole)`. Each returns `{ state, events }` and never mutates its input.
- `rules/run.ts` `Run` is the whole run: seed, daily date key (or null), depth, banked gold, drafted tool ids. Scenes pass it to each other via `scene.start(key, { run })`.
- Randomness comes from `streamFor(run, 'spawn' | 'hop' | 'draft')`: a fresh stream per purpose per depth, derived from the run seed. Never share one stream across purposes.
- Daily runs (`newDailyRun(new Date())`, the DAILY button in the office): seed is the hash of the UTC date key. Fairness rule: the `spawn` stream must be consumed identically whatever the player does. So `tick` always rolls both dice per spawn, and anything player-dependent (boss hops, in `tick` and `whack`) uses the `hop` stream. `tests/daily.test.ts` enforces this; keep it passing when touching `rules/shift.ts`.
- Daily runs ignore permanent upgrades (level field); drafted tools still apply. Gold still banks. `Save.daily` keeps today's best depth; attempts are unlimited.
- `data/tools.ts` defines tools as data (`mods`). `rules/tools.ts` `applyTools(cfg, run.tools)` folds them into the shift config; `draftOffer` picks up to 3 the player can still take. Tools stack for the rest of the run, up to `maxStacks`.
- Flow: `office` (`ui/office-scene.ts`, opens at launch), CLOCK IN, `shift`, cleared, tap, `draft` (`ui/draft-scene.ts`), pick a card, `shift` at depth + 1. Sacked, tap, back to `office`.
- `meta/progression.ts` is the pure save model (`Save`: banked gold, best depth, upgrade levels): `buyUpgrade`, `bankShift`, `upgradeMods`, `sanitizeSave`. `meta/storage.ts` persists it to localStorage and holds the live copy: read with `getSave()`, replace with `setSave()`. Never mutate a save in place.
- `data/upgrades.ts` defines permanent upgrades. Their `mods` use the same `ToolMods` shape and the same `applyMods` path as tools, once per level.
- Gold is banked when a shift ends (cleared or sacked), not on the next tap, so quitting on the results page loses nothing.
- Loaded saves are untrusted: everything goes through `sanitizeSave`. If the save shape changes, bump the storage key or migrate there.
- Ads: scenes import `ads` (and `purchases`) from `src/services` and nothing deeper. `ads` is an `AdGate` (`services/ads/ad-gate.ts`) wrapping an `AdService` provider. The gate refuses every ad between `ads.shiftStarted()` and `ads.shiftEnded()`, shows one ad at a time, and applies the interstitial cap. Policy numbers and pure checks live in `rules/ads.ts` (`INTERSTITIAL_EVERY` = 4 shifts, `CHESTS_PER_DAY` = 3, `CHEST_GOLD` = 40). Counters persist in `Save.ads`.
- Ad placements: results page has DOUBLE GOLD and REVIVE (once per run) buttons, and one capped interstitial when leaving it, skipped if a rewarded ad was just watched. Draft has one reroll. Office has the gold chest. Revive and reroll are off in daily runs.
- Providers are mocks in every build right now: `overlay-ad-service.ts` (visible stand-in ads, a DOM overlay on purpose) and `mock-purchase-service.ts`. Swap real ones in at `src/services/index.ts` only. Do not ship the mocks.
- A shift can end twice (revive): `ShiftScene` banks only the gold not yet banked.
- Leaderboard: `meta/leaderboard.ts` is the pure client (submission, `acceptable` mirrors the server rules, queue, flush). Providers in `services/leaderboard/` (local stand-in, Supabase), chosen in `services/index.ts`. A sacked run is queued in `Save.pending` keyed by run id (a revive then a later sacking replaces it) and sent when Head Office opens; offline entries stay queued. Ordinary runs go to the all-time board, daily runs to that day's board. `Run.elapsedMs` counts played shift time (same clamped dt as the rules); the server checks depth against it. Players have no accounts: `Save.playerId` (uuid) and a derived name "Clerk NNNN".
- Server (`supabase/migrations/*_leaderboard.sql`): table `scores` is closed to clients (RLS on, no grants). Clients call only `submit_score` and `top_scores`, SECURITY DEFINER functions with explicit grants to `anon` only. That is deliberate: there is no auth, so they are the validated public API. Keep every rule change in both the SQL and `acceptable`.
- Bosses are moles with `boss: true` in `data/moles.ts`; each layer names its boss in `data/layers.ts`. The boss arrives when `bossAtMs` (15s) is left, takes `bossHp` bonks, and costs a life if still standing at the whistle. Shields never forgive a boss. Behaviour is data: `hopEveryHits`, `hopEveryMs`. Boss hp grows by 2 per layer cycle, capped at +8.
- `whack` takes the rng (hopping bosses need it).
- Never add a tool that shortens a shift: the leaderboard caps depth by elapsed time.
- Dev server only: `/?depth=5&tools=gold-pan,day-off` starts a shift there, `&draft` opens the draft screen, `/?gold=500` sets the bank on every load, `&boss` brings the boss in after 3 seconds, and `window.game` is exposed. None of this is in production builds.
- `game/shift-scene.ts` calls those every frame, turns events into stamps and lettering, and redraws from state. It holds no gameplay rules.
- Drawing uses two Graphics layers, one per ink. The second ink layer is blend-mode MULTIPLY and offset a few pixels, which gives overprint and misregistration. Draw each shape in exactly one ink.
- `art/paper.ts` makes the halftone and grain textures. These are tiled canvas textures for now; the shader is still the plan (see the `ponytail:` comment).
- Phaser is v4: import with `import * as Phaser from 'phaser'` (no default export).
- Android is locked to portrait in `android/app/src/main/AndroidManifest.xml`. Game space is 720x1280, scaled to fit.

Rule of thumb: anything testable without a browser goes in `src/rules`, `src/generation`, or `src/meta`, with no Phaser import. Phaser code stays in `src/game` and `src/ui`.

## Design rules

Monetisation (hard constraints):

- Never gate depth, tools, or layers behind payment.
- Rewarded ads only for optional rewards: revive, double gold (uncapped), reroll draft, gold chest (max 3 per day).
- Interstitials only on results and draft screens, capped at about 1 per 3-4 shifts. Never mid-shift.
- Remove Ads: one-time purchase, disables interstitials only. Rewarded ads stay.
- Paid: cosmetics, starter pack, season pass, modest convenience boosts.
- Season pass: 30-day seasons. Free and paid tracks both visible from day one. Free track is complete, not a teaser.
- No loot boxes, no random paid items.
- All ad and purchase calls go through `src/services/*`. Game code never imports an ad or IAP SDK.

Art direction:

- Two-ink risograph look: tomato red and teal on cream paper. Two inks only per layer.
- Visible halftone dots, slight colour misregistration, grain.
- Each depth layer swaps the ink pair.
- Halftone and misregistration are a runtime fragment shader. The ink pair is two uniforms. Do not bake per-layer sprite sheets.
- Hit feedback: stamped ink splats and hand-drawn "BONK" lettering. No particle glitter.
- No gradient-heavy or generic flat-vector UI.

## Code conventions

- Game data is data, not code. Add a mole, tool, layer, or boss by adding an entry in `src/data/`, not by adding a branch in the loop.
- Pure rules in `src/rules` take plain objects and return plain objects. Phaser scenes call them.
- Game state flows one way: rules compute the next state, scenes render it. No state kept only in Phaser objects.
- Randomness: always use the seeded RNG from `src/rules/rng.ts`, never `Math.random()` in gameplay code.
- Services are interfaces with a `mock` implementation beside the real one. Tests use the mock.
- Naming: kebab-case files, PascalCase types, camelCase functions and values.

## Testing expectations

Required unit tests (Vitest, in `tests/`):

- Depth generator: same seed gives same layout; layer count and difficulty rise with depth.
- Scoring and lives: hitting a decoy or missing a golden mole costs 1 life; 0 lives ends the shift; depth = score.
- Tools: `applyTools` stacking, each shield effect, `draftOffer` is seeded, distinct, and skips maxed tools.
- Daily runs: UTC date key, same seed all day, idle and busy players consume identical spawn rolls, daily record resets by date.
- Bosses: arrive once, hp and payout, life lost at the whistle, hop rules, never land on another mole.
- Progression: upgrade costs and limits, buying never goes negative, `sanitizeSave` survives garbage, storage survives corrupt or failing storage.
- Leaderboard (`tests/leaderboard.test.ts`): rules mirror, queue and flush, save sanitising, local board, Supabase request shape. Its `live server` block runs only with `UH_LEADERBOARD_REST_URL` (a PostgREST root, or `https://<ref>.supabase.co/rest/v1`) and `UH_LEADERBOARD_KEY` set; it writes rows, so never point it at production.
- Ads (`tests/ads.test.ts`): interstitial at most once per `INTERSTITIAL_EVERY` shifts, never mid-shift, only on results/draft, off with Remove Ads; the gate never reaches the provider mid-shift; chest daily cap; revive; reroll.

Keep tests on pure logic. No Phaser in tests.

## Things to avoid

- Ads mid-shift.
- Pay-to-win gating of depth, tools, or layers.
- Loot boxes or random paid items.
- Generic flat-vector or gradient-heavy art.
- Calling ad or IAP SDKs outside `src/services`.
- `Math.random()` in gameplay.

## Leaderboard rules (server side)

- Reject a daily submission whose seed date differs from the server's UTC date.
- Reject depth greater than (elapsed shift seconds / 60) + 1.
- One submission per run ID.
- No replay validation in v1. Add only if cheating shows up.

## Open questions

None open. Deferred by decision: cloud save, replay validation, folder rename.

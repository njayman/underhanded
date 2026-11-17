# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Underhanded: endless roguelike whack-a-mole for mobile. App ID `com.njayman.underhanded`. The folder name `whakawhaka` is only a dev codename.

- Run = 60-second "shift". Shifts group into arenas (3, then 5, then 10 shifts) with a boss on each arena's last shift and a checkpoint at each arena. Endless: difficulty and mole hp keep climbing.
- Moles steal gold from Lower Gridley. They wear bowler hats, carry ledgers, file complaints.
- Arenas are departments: Fungus Archives, Pipe Works, Gold Vault, Sewer Opera, cycling with harder tiers.
- Moles have hp; hammers have damage. 3 lives per shift. Hitting a decoy (foreman) or missing a golden mole costs a life and breaks the combo.
- Combo meter fills on hits and powers field abilities (quake, trap, freeze, frenzy); a whiff or wrong target breaks it.
- Between shifts: draft 1 of 3 tools for the rest of the run. Gold buys hammers, ability levels, hard hats (shields) and permanent upgrades.
- Score = depth. Two leaderboards: daily (resets each UTC day) and all-time best depth.
- Daily seeded runs: same moles for everyone, scaled to each player's gear. Seed = UTC date string (e.g. `2026-11-16`) hashed into the RNG. Works offline.

## Tech stack

- TypeScript + Phaser (game), Vite (build), Vitest (unit tests), ESLint (typescript-eslint).
- Capacitor 8 packages Android and iOS from the Vite `dist/` output.
- Supabase: leaderboard backend, project ref `efmvaupclslqzfrucyda` (live; `20261117142053_leaderboard` applied). Called with plain `fetch` (no SDK). Schema in `supabase/migrations/`; local migration filenames must match the versions recorded on the project (check with the MCP `list_migrations`). `.mcp.json` pins the Supabase MCP server to this project. This project auto-grants `anon`/`authenticated` full rights on new `public` tables and functions: every migration must revoke and grant explicitly. Expected advisor warnings: `submit_score`/`top_scores` callable by anon (by design), RLS with no policies on `scores` (by design), Supabase's own `rls_auto_enable` (an event trigger function, not callable). Configure with `.env.local` (git-ignored): `VITE_SUPABASE_URL=https://<ref>.supabase.co` and `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`. Without them the game uses a local stand-in board. Only the publishable key ever goes in the app, in the `apikey` header only (it is not a JWT, never a Bearer token).
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
src/meta/             save model, gear, workshop, season pass, store grants, leaderboard client
src/audio/            synthesised sound effects and music
src/services/leaderboard/  local stand-in board and Supabase provider
supabase/migrations/  leaderboard schema and functions
src/services/index.ts the live `ads` gate and `purchases`; the one place providers are chosen
src/services/ads/     AdService interface, AdGate, mocks. Only place ad SDKs are touched.
src/services/iap/     PurchaseService interface + mock. Only place IAP is touched.
src/ui/               office hub, workshop, store, season pass, draft, leaderboard. Phaser scenes only, no DOM overlays.
src/art/              riso print system (filter, shader, ink helpers) and fonts.css
assets/fonts          bundled fonts and their licences
tests/                Vitest unit tests, mirror src/rules, src/generation, src/meta
```

How the game fits together:

- Structure: depth = global shift number, endless. Shifts group into arenas (`generation/depth.ts`): arenas 1-2 have 3 shifts, 3-4 have 5, then 10. Each arena is one department (`data/layers.ts`, cycling, tier numeral after the first lap). Only an arena's last shift has its boss (arrives at 20s left). `shiftConfigForDepth(depth, power)` gives speed, `hpScale` (+10% per shift, unbounded), the mole mix (couriers from depth 4, auditors from 8) and the boss.
- Checkpoints: `Save.arena` is where CLOCK IN starts (depth `shiftsBefore(arena) + 1`). Clearing an arena's last shift advances it. Sacked = back to the start of the checkpoint arena; run tools are lost.
- `rules/shift.ts` owns shift state: `createShift`, `tick(state, dt, cfg, spawnRng, hopRng)`, `whack(state, hole, cfg, hopRng)`, `useAbility(state, id, cfg, hole?)`, `revive`. Each returns `{ state, events }` and never mutates its input. Moles have hp; hammer hits deal `cfg.damage` (x2 in Frenzy). Tapping an empty hole is a whiff.
- Combo meter: every damaging hit adds to `combo` (gold multiplier, +20% per 10, max x2) and `meter` (0..`METER_MAX` 20, x `meterGain`). A whiff, a foreman hit or a lost golden mole breaks both.
- Abilities (`data/abilities.ts`), spent from the meter: quake (damage all, spares foremen), trap (set on a hole, snaps the next mole; catches foremen harmlessly), freeze (moles stop ageing), frenzy (double damage). Levels 0-5 bought with gold; quake and trap start at 1.
- Lost lives: tool shields first (decoy/golden), then hard hats (bought with gold, up to 3 carried per shift, `ShiftScene` deducts each used one from the save immediately), then lives.
- Gear: `meta/gear.ts` `applyGear(base, save, tools)` = permanent upgrades + equipped hammer damage + ability levels + hard hats + run tools. Hammers (`data/hammers.ts`) are gold-only.
- `rules/run.ts` `Run` is one run: id (uuid), seed, daily key or null, depth, banked gold, drafted tools, revived, elapsedMs. Scenes pass it via `scene.start(key, { run })`.
- Randomness comes from `streamFor(run, 'spawn' | 'hop' | 'draft' | 'reroll')`: a fresh stream per purpose per depth. Never share one stream across purposes.
- Daily runs (`newDailyRun(new Date())`): seed is the hash of the UTC date key; they use your gear, but mole hp is scaled by `playerPower` (hammer damage) so the board compares skill. Fairness rule: the `spawn` stream must be consumed identically whatever the player does: `tick` always rolls both dice per spawn, and anything player-dependent (boss hops) uses the `hop` stream. Abilities and traps never touch the spawn stream. `tests/daily.test.ts` enforces this; keep it passing when touching `rules/shift.ts`.
- `data/tools.ts` defines run tools as data (`mods`, including `damage` and `meterGain`). `rules/tools.ts` `applyMods`/`applyTools` fold mods into a config; `draftOffer` picks up to 3.
- Flow: `office` hub (`ui/office-scene.ts`): CLOCK IN, DAILY RUN, WORKSHOP, STORE, SEASON PASS, LEADERBOARD, gold chest, sound toggle. Shift, cleared, tap, `draft`, pick, next shift. Sacked, tap, office.
- Menus share `ui/widgets.ts` (`button`, `row`, `card`, `listen`, `header`). Workshop (`ui/workshop-scene.ts`): hammers, abilities, supplies (hard hats, skin equip), upgrades. Store (`ui/store-scene.ts`): real-money products from `data/store.ts`. Season pass (`ui/season-scene.ts`).
- `meta/progression.ts` is the pure save model; `meta/shop.ts` workshop purchases; `meta/season.ts` season xp, claims and `grantProduct` (pays a store product out once, tracked in `Save.granted`). `meta/storage.ts` persists to localStorage and holds the live copy: read with `getSave()`, replace with `setSave()`. Never mutate a save in place.
- Season pass: 30-day UTC windows (`seasonOf`), shown as Season 1 from launch (`FIRST_SEASON`). 20 tiers, `TIER_XP` 60; 10 xp per cleared shift, 25 per boss. Free and paid tracks (`data/season.ts`); paid claims need this season's pass product.
- Gold is banked when a shift ends (cleared or sacked), not on the next tap, so quitting on the results page loses nothing. Same for play time (`Save.playedMs`), season xp and the arena checkpoint.
- Loaded saves are untrusted: everything goes through `sanitizeSave`. If the save shape changes, bump the storage key or migrate there.
- Ads: scenes import `ads` (and `purchases`, `leaderboard`) from `src/services` and nothing deeper. `ads` is an `AdGate` (`services/ads/ad-gate.ts`) wrapping an `AdService` provider. The gate refuses every ad between `ads.shiftStarted()` and `ads.shiftEnded()`, shows one ad at a time, and applies the interstitial cap. Policy numbers live in `rules/ads.ts` (`INTERSTITIAL_EVERY` = 4 shifts, `CHESTS_PER_DAY` = 3, `CHEST_GOLD` = 40). Counters persist in `Save.ads`.
- Ad placements: results page has DOUBLE GOLD and REVIVE (once per run) buttons, and one capped interstitial when leaving it, skipped if a rewarded ad was just watched. Draft has one reroll. Office has the gold chest. Revive and reroll are off in daily runs.
- Providers are mocks in every build right now: `overlay-ad-service.ts` (visible stand-in ads, a DOM overlay on purpose) and `mock-purchase-service.ts` (instant, free, persisted to localStorage). Swap real ones in at `src/services/index.ts` only. Do not ship the mocks.
- A shift can end twice (revive): `ShiftScene` banks only the gold, play time and xp not yet banked.
- Leaderboard: `meta/leaderboard.ts` is the pure client (submission, `acceptable` mirrors the server rules, queue, flush). A sacked run is queued in `Save.pending` keyed by run id and sent when Head Office opens. Ordinary runs go to the all-time board with `elapsedMs` = total play time (`Save.playedMs`), since they start at the checkpoint; daily runs use the run's own time. Players have no accounts: `Save.playerId` (uuid) and a derived name "Clerk NNNN".
- Server (`supabase/migrations/*_leaderboard.sql`): table `scores` is closed to clients (RLS on, no grants). Clients call only `submit_score` and `top_scores`, SECURITY DEFINER functions with explicit grants to `anon` only. Keep every rule change in both the SQL and `acceptable`.
- Bosses are moles with `boss: true` in `data/moles.ts`; each layer names its boss. Behaviour is data: `hopEveryHits`, `hopEveryMs`. A boss standing at the whistle costs a life; tool shields never forgive it (hard hats do).
- Never add a tool, upgrade or ability that shortens a shift: the leaderboard caps depth by elapsed time.
- `game/shift-scene.ts` turns rule events into feedback (stamps, lettering, shakes, sound, music level) and redraws from state every frame. It holds no gameplay rules. Phaser reuses scene objects: reset every per-shift field (including text lists) in `create()`.
- Art system (`art/paper.ts`): scenes draw ink COVERAGE, not colour. Red channel = ink A (`INK_A`), green = ink B (`INK_B`), on a black page; `NO_INK` knocks ink out (bare paper). `printPage(scene, layer, groundTop)` adds the `Riso` camera filter (custom render node `FilterRiso`, registered in `main.ts`) which prints the channels with the layer's two inks: tints become halftone dots, ink B is offset (misregistration), overlaps multiply, grain is added. It returns `k` (knockout, normal blend), `a` and `b` (additive ink layers). Draw solid ink A shapes over the halftone ground with a `k` knockout under them, or they print dotted. `inkText` text is additive unless `NO_INK`. Changing inks = `riso.setInks`. WebGL only (`type: Phaser.WEBGL`).
- Fonts are bundled (`assets/fonts`, licences beside them) and awaited before boot: `TITLE` (Anton) for headings and buttons, `LETTERING` (Permanent Marker) only for hand-lettered stamps, `LEDGER` (Courier Prime) for body text.
- Mole and boss art: `game/mole-art.ts` (`drawMole`, `drawTrap`), one case per mole id. Hammer swing and icons: `game/hammer.ts`; skins (`data/skins.ts`) are patterns on the head.
- Audio (`src/audio/sfx.ts`): everything synthesised with Web Audio, no files. `sfx.*` one-shots, `music.start/setLevel/stop` (level 0 normal, 1 combo >= 10, 2 boss or frenzy). Unlocked on the first tap; mute in `Save.muted`.
- Dev server only: `/?depth=5&tools=gold-pan,day-off` starts a shift there, `&draft` opens the draft screen, `/?gold=500` sets the bank on every load, `&boss` brings a boss in after 3 seconds, `&meter` starts with a full meter, `/?scene=workshop|store|season|board` opens that screen, and `window.game` is exposed. None of this is in production builds.
- Phaser is v4: import with `import * as Phaser from 'phaser'` (no default export). Its bundled agent docs are in `node_modules/phaser/skills/` (filters, render nodes, etc.).
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

- Depth and arenas (`tests/depth.test.ts`): arena sizes, `arenaOf`/`shiftsBefore` inverses, boss only on last shift, hp rises every shift, power scaling.
- Scoring and lives (`tests/shift.test.ts`): hp and damage, decoys, golden escapes, whiffs, seeded spawns.
- Combat (`tests/combat.test.ts`): combo, meter, breaks, every ability, traps, hard hats.
- Workshop, gear, season pass, store grants (`tests/shop.test.ts`).
- Tools: `applyTools` stacking, each shield effect, `draftOffer` is seeded, distinct, and skips maxed tools.
- Daily runs: UTC date key, same seed all day, idle and busy players consume identical spawn rolls, daily record resets by date.
- Bosses: arrive once, hp and payout, life lost at the whistle, hop rules, never land on another mole.
- Progression: upgrade costs and limits, buying never goes negative, `sanitizeSave` survives garbage, storage survives corrupt or failing storage.
- Leaderboard (`tests/leaderboard.test.ts`): rules mirror, queue and flush, save sanitising, local board, Supabase request shape. Its `live server` block runs only with `UH_LEADERBOARD_REST_URL` (a PostgREST root, or `https://<ref>.supabase.co/rest/v1`) and `UH_LEADERBOARD_KEY` set; it writes rows, so never point it at production.
- Ads (`tests/ads.test.ts`): interstitial at most once per `INTERSTITIAL_EVERY` shifts, never mid-shift, only on results/draft, off with Remove Ads; the gate never reaches the provider mid-shift; chest daily cap; revive; reroll.

Keep tests on pure logic. No Phaser in tests.

## Things to avoid

- Ads mid-shift.
- Pay-to-win gating of depth, tools, or layers. Hammers, abilities and upgrades are gold-only; real money buys cosmetics and convenience only.
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

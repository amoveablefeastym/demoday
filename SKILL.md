---
name: demoday
description: Make a captivating launch/demo video for a product from its repo (GitHub or local folder) and its live web app OR native macOS app — storyboard (pain-first, before/after, "only us"), scripted recording with auto-zoom, captions and sound effects, styled to match the app's own look, assembled in Remotion into an MP4. Use when the user asks for a demo video, launch video, product video, promo or walkthrough recording of a repo, web app or Mac app.
---

# demoday

Turns a repo (GitHub or a local folder) + its live web app or native macOS app into a 45–75s 1080p demo video that looks like it was made by the app's own designer. The tool is a Node/TS CLI that ships with this skill. **You** are the director: you write the storyboard (`plan.json`); the tool records and renders it. No API key needed.

## 0. Find and set up the tool (`TOOL`)

`TOOL` is **this skill's base directory** if it contains `package.json` (the normal install: the whole repo cloned into `~/.claude/skills/demoday`). Otherwise it is `~/demoday`. If neither exists, stop and point the user to the install steps in the README.

First run on a machine (when `TOOL/node_modules` is missing):
1. Check `node --version` (needs ≥ 20). If it's missing, tell the user to install Node.js (`brew install node` or nodejs.org) and stop.
2. Run `npm install && npx playwright install chromium` in `TOOL`. It downloads ~300 MB, so tell the user before you start.
3. For a Mac app, also check `xcrun swiftc --version`. If it's missing, ask the user to run `xcode-select --install`. The helper compiles itself on first use.

All commands below run from `TOOL`. `OUT` = `out/<owner>__<repo>` (printed by the tool). Videos stay inside `TOOL/out/`, so tell the user the full path.

## 1. Gather

```bash
npx tsx src/cli.ts <owner/repo or github url> [--url <live app url>] --prepare
```

Needs a live **web** URL (`--url`, else the repo's homepage) — or, for a **native macOS app**, see "Native Mac apps" below. This reads the repo and probes the app, writing to OUT:
`prompt.md` (director rules + README + manifests + file tree + accessibility snapshot), `probe.png` (first-screen screenshot), `probe.aria.yml`.

Read `prompt.md` and look at `probe.png`. Read `src/schema.ts` — it is the exact shape of `plan.json`, and its field descriptions are rules (word limits, what each beat must do).

## 2. Find the story before writing anything

The video lives or dies on two things: **why the status quo is bad** and **what's special about this product**.

- **Status quo**: the concrete workflow the target user does *today* without this product, with an honest time cost per step. Fair claims only about named competitors.
- **Special**: the *mechanism* that makes this possible (from README/code), not adjectives. "Only X …".
- **Read the code for features the README undersells**: an always-there desktop or menu-bar icon, a global hotkey, offline/local storage, a mascot. These are often the real differentiators. Verify every feature you claim in the code before putting it in the video.
- If the user told you their positioning, competitor or differentiator, use theirs. If nothing reveals what makes it different, ask one short question before writing the plan.

## 3. Match the app's style (required)

The video must look like part of the app: same colors, same fonts, same mascot or icon, same tone of voice. A generic dark launch template on a cozy pastel app (or vice versa) reads as off-brand. Users notice immediately.

1. **Extract the app's design tokens from the code**:
   - **SwiftUI/AppKit:** a `Theme.swift`-style file, `Assets.xcassets/*.colorset`, `Color(hex:)` calls.
   - **Web:** CSS custom properties, `tailwind.config.*`, theme files, `<meta name="theme-color">`.
   - Collect: background, text, card/panel, accent, and the display/body fonts.
   - **Fonts:** prefer font files bundled in the repo (`Resources/Fonts/*.ttf`, `public/fonts`, `@font-face` sources, `next/font/local`).
   - **Mascot/icon:** sprites, the app icon (`AppIcon.icns` → `sips -s format png … --out icon.png`), or the logo SVG/favicon.
2. **Pick the mood from the app's UI, not its category**. Use `mood: "soft"` when the UI is light, warm, playful or minimal. Use `bold` (the default dark launch look) when the app itself is dark, technical or high-contrast.
3. **Fill `plan.look`**:
   ```json
   "look": { "mood": "soft", "paper": "<app bg>", "ink": "<app text>", "surface": "<app card>",
             "fontFile": "<repo font file>", "bodyFontFile": "<optional>",
             "motifImage": "<app icon/mascot png/svg>" }
   ```
   - Set `product.accent` to the app's accent, in the shade that's readable on `paper`. Light-mode accents are usually the right pick for soft.
   - Muted text and lines are derived from `paper`/`ink` automatically.
   - Without a font file, use `display` (Inter Tight, Pixelify Sans, Fredoka, Nunito). To support another Google font, add it to `DISPLAY` in `remotion/lib.ts` and the schema enum.
   - `motif: "loaf"` is a built-in pixel-loaf sprite (bakery apps only). Otherwise use `motifImage`.
   - The CLI copies these files into `OUT/brand/`. Paths may be absolute or relative to a local repo.
4. **Match the voice**: borrow the app's own microcopy and metaphors for captions and headlines (e.g. a bakery app's "dough / rising / baked").
5. **Minimal by default**:
   - Copy budget: hook ≤ 8 words, about 3 old-way steps, 3 compare rows, captions of 2–5 words, no labels or stats beyond the essentials.
   - Too many words and loud red warning styling were the top complaints. The soft look already drops counters, pain labels, shake and stamps.

## 4. Write `OUT/plan.json`

Follow the director rules at the top of `prompt.md`. Recording rules (`newWay.actions`):

- **Cover the whole core loop**, not just the shortest path to one result. Users notice when headline features are missing. Aim for 10–20 actions (max 20), each feature its own captioned beat, doing the **same job** as the old way and ending on the payoff. Web: the first action is `goto` the live URL.
- **Caption almost every action.** A beat without one reads as dead air to a muted viewer.
- **Camera**: it pushes in on each action's target box. Untargeted `fill`/`press` actions aim at the field that has focus. The recorder logs its position after the keys are sent, and typing shots zoom to 2× on the start of the text. Captions sit in their own band below the window and never cover the app. If a shot frames the wrong thing, fix the target. Don't hand-edit boxes.
- **Selectors** come from the snapshot. Prefer `{role, name}` copied verbatim (macOS: `id`, then `placeholder`, then `role`+`name`). Hidden inputs inside code editors are fine; the recorder clicks their visible container.
- **Script deeper screens from real snapshots, not guesses**:
  1. Write a throwaway script that navigates there and ends with a click on a nonexistent `id`.
  2. Run it: `mac/.build/macdriver run --app X.app --out <scratch> --script s.json -- --demo <scratch>/data`. The file is `{"actions":[…]}`. Web: a `--from plan` run.
  3. Read `failures[].aria` in `<scratch>/events.json`.
- **Typing**: `fill` values > 80 chars are pasted; shorter ones are typed visibly. Use realistic data, never "test". If keystrokes go missing right after a click into a new field (a truncated title, an empty field, a later click that can't find the text), split it: `click` the field, `wait` 500, then untargeted `fill`.
- **Payoff**: exactly one action has `emphasis: true`. Put it on a final `wait` (~2000ms) with a caption, right after the click that triggers it, not on the click itself. The camera then pulls back to show the whole result, and emphasis waits play in real time. Other long waits are fast-forwarded.
- **Launcher beat**: if the app lives as an always-there icon (desktop, menu bar) or behind a global hotkey, set `plan.launcher` (`captions`, optional `hint` such as the hotkey, optional `badge`).
  - The video then gets a beat before the walkthrough: the icon sits on a calm desktop among blurred windows, the cursor clicks it, and the real window grows out of it, landing exactly where the walkthrough starts.
  - It's composed in Remotion (the recorder only captures the app window) and uses `motifImage`/`motif` as the icon. Only use it when the code confirms the behavior.

## 5. Record + render

```bash
npx tsx src/cli.ts <repo> --plan OUT/plan.json --from plan
```

Watch the log: `✓` per action, `✗` with the error for failures. On failures, read `OUT/events.json` → `failures[]` (each has the accessibility snapshot *at the moment it failed*), fix the targets, and re-run. Failed actions are skipped, not fatal. Don't ship a video whose payoff failed. **If an early action fails, everything after it usually runs on the wrong screen:** treat the whole recording as bad and look at `raw.mp4` frames to see what really happened.

Re-running cheaply:
- **Copy, look, `launcher`, sound or scene code changes:** `--from render`, no re-recording.
- **Action captions** are baked into `events.json` at record time. Patch them there from `plan.json` (by `index`), rebuild the timeline with `npx tsx -e 'import {editRecording} from "./src/edit.ts"; editRecording("OUT")'`, then `--from render`.
- **Step changes:** `--from plan` (re-records).

## 6. Review before reporting

Review the **rendered MP4**, not just the stills. Make contact sheets and look at every frame:

```bash
ffmpeg -v error -y -i OUT/demo.mp4 -vf "fps=1/2,scale=640:-1,tile=4x8" -frames:v 1 <scratch>/sheet.jpg
```

Check:
- **Style match**: put `probe.png` next to the stills. Same background family, fonts, accent and mascot? If the video looks like a different brand, fix `look` before anything else.
- Every `fill` value appears on screen exactly as typed. A ✓ only means the action ran, not that the text landed.
- The camera is pushed in on what matters (the text being typed, the control being clicked), not wide or on empty canvas.
- Captions are readable and never cover the app. Text fits; nothing overflows.
- The aha frame shows the payoff (not a loading state or a cropped button).
- The compare beat's "X → Y" is believable. If the ratio is absurd, the old-way `seconds` are inflated.
- Audio exists and peaks below 0 dB: `ffmpeg -i OUT/demo.mp4 -af volumedetect -vn -f null -`. To check sync, draw a `showwavespic` of a typing stretch and compare it with frames.

## 7. Report

Give the user:
- the path to `OUT/demo.mp4` and its length
- the hook, old-way and only-us lines, one line each
- how the look was matched (which colors, fonts and mascot came from the app)
- anything you couldn't make work, or that was composed rather than recorded (e.g. the launcher beat)
- any bugs you noticed in their app (e.g. dropped keystrokes)

Mention the `npx remotion studio …` command the tool prints for live tweaks, and `--music <file>` for a soundtrack.

## Sound effects

On by default; `--no-sfx` turns them off. `scripts/make-sfx.py` synthesizes everything (no samples, no licensing) into `assets/sfx/`, and `remotion/Sfx.tsx` times each sound off the recorded events:
- **Typing**: one tactile mechanical switch sound per character (bump click, bottom-out thock, release), at the recorder's real typing speed. Spaces get a deeper stabilized sound, Enter a heavier one.
- **Clicks**: a mouse click wherever the recorded cursor clicked, including the launcher click.
- **Transitions**: a whoosh at each scene change.
- **Old way**: a card-landing sound per step (pops in soft, thuds in bold) and a verdict sound (soft pop, or a stamp in bold).
- **Payoff**: a chime.
- **Compare**: a pop per row, and a chime (soft) or stamp (bold) on the time result.

With `--music`, the music is lowered under the effects. Change volumes in `Sfx.tsx` and re-run `--from render`. Re-run the script after editing it to regenerate the WAVs.

## Native Mac apps

Same flow, different recorder (`mac/macdriver.swift`: Accessibility API to find controls, real mouse/keyboard events, ScreenCaptureKit records only the app window). Add `--app` and pass launch args after `--`:

```bash
npx tsx src/cli.ts <repo or ./local/dir> --app path/To.app [--app-seed demo/items.json] --prepare -- --demo {data}
```

- `{data}` becomes a fresh throwaway folder per run, and `--app-seed` is copied into it. **Never record against the user's real data.** If the app has no demo/data-dir launch flag, add one (or ask the user) before recording. Rebuild the app first if the user has uncommitted changes.
- Run `mac/.build/macdriver check --open` first. It needs **Accessibility** and **Screen & System Audio Recording** for the app hosting the terminal. If either is missing, it opens the exact System Settings pane and names the app to enable (exit code 3). The user must restart that app after granting, which ends this session, so stop and tell them to come back instead of retrying. Without Screen Recording, `--prepare` still works but recording does not. Write the storyboard meanwhile so it's ready.
- **Recording takes over the user's real mouse and keyboard** (~20–60s, 3s countdown). Tell the user right before every run, including short probe runs. Don't start while they might be typing: their input steals focus and ruins the take.
- Targets: `id`, then `placeholder`, then `role`+`name`. No `goto`. `fill` without a target types into the focused field. Use `press` for Enter/Tab/`Meta+N`.
- Unlabeled icon buttons are invisible to automation. If a key control has no name and you own the code, add `.accessibilityLabel`/`.accessibilityIdentifier`.
- **Don't query the Accessibility tree while keys are being typed.** In SwiftUI apps an AX query can trigger a re-render that resets a text field to stale text, dropping keystrokes. The driver only reads the focused element after typing. If you change the driver, keep it that way. If keystrokes still vanish, the app likely has this bug (an `NSViewRepresentable` text view whose `updateNSView` overwrites the string with a stale binding). Tell the user.

## Limits

Web pages behind a login need the flow to start from a public page or a pre-authenticated URL. Native recording is macOS-only and records a single app window. Anything outside it (desktop, menu bar, other apps) is composed in Remotion, not recorded, so say so in the report.

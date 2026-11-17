# demoday

GitHub repo in, launch demo video out.

## Install (as a Claude Code skill)

The whole repo **is** the skill. Clone it into your skills folder and ask Claude Code for a demo video:

```bash
git clone https://github.com/amoveablefeastym/demoday ~/.claude/skills/demoday
```

Then, in any Claude Code session: *"make a launch video for owner/repo"* or `/demoday`.
On first use Claude installs the dependencies itself (`npm install` and Playwright's Chromium, about 300 MB).
No Anthropic API key is needed: Claude Code writes the storyboard.

**Requirements**
- [Claude Code](https://claude.com/claude-code)
- Node.js 20+ (`brew install node`)
- For **native Mac app** demos only: macOS 15+, Xcode Command Line Tools (`xcode-select --install`), and two permissions for the app you run Claude Code in (VS Code, Terminal, …): *Accessibility* and *Screen & System Audio Recording*. demoday opens the right Settings page for you. Restart that app after granting. Recording drives your real mouse and keyboard for 20–60s.
- **Remotion license:** rendering uses [Remotion](https://remotion.dev), which is free for individuals and small companies but needs a paid company license above that size. Check [remotion.dev/license](https://remotion.dev/license) before using it at work.

**Update:** `git -C ~/.claude/skills/demoday pull`

**Team-wide:** clone it into a project's `.claude/skills/demoday` instead, and everyone working in that repo gets the skill.

## Use without Claude Code

```
npx tsx src/cli.ts owner/repo [--url https://live.app]
```

1. **Read** the repo from GitHub: README, manifests, file tree, homepage.
2. **Probe** the live app with Playwright (accessibility snapshot + screenshot), so selectors are real and not guessed.
3. **Direct** a storyboard with Claude (`claude-opus-5-5`, structured output → `plan.json`).
4. **Generate** a standalone, editable Playwright script (`record.ts`) that types and clicks at human speed, logs every action's timing and bounding box, and logs the cursor path.
5. **Record**, and if steps fail, send Claude the failure plus a fresh snapshot to repair the steps (`--retries`).
6. **Edit**: trim dead air and fast-forward waits (shown with a ▶▶ badge), keeping every interaction in real time.
7. **Assemble** in Remotion: auto-zoom camera driven by click boxes, a redrawn cursor with click ripples, burned-in captions, transitions.

Output: `out/<owner>__<repo>/demo.mp4` (1080p, about 35–60s). Every intermediate file stays on disk, so you can edit it and resume:

| Edit this | Then run |
| --- | --- |
| `plan.json` (story, copy, steps) | `--from record` |
| `record.ts` (the Playwright script) | `npx tsx out/…/record.ts out/…` then `--from render` |
| scene visuals | `npx remotion studio remotion/index.ts --public-dir out/… --props out/…/props.json` |

Env: `ANTHROPIC_API_KEY` (or pass `--plan plan.json`), optional `GITHUB_TOKEN`. Without a key, the full storyboard prompt is written to `prompt.md`.

**Native macOS apps:** add `--app X.app` and pass launch args after `--`. `{data}` is a fresh throwaway data folder per run:
```
npx tsx src/cli.ts ./my-mac-app --app build/My.app --app-seed demo/items.json -- --demo {data}
```
The `mac/macdriver.swift` helper (compiled on first use) finds controls with the Accessibility API, drives the real mouse and keyboard, and records only the app window with ScreenCaptureKit. It needs Accessibility and Screen Recording permission for your terminal or VS Code, and it takes over the mouse while recording.

**How the skill works:** `SKILL.md` has Claude Code direct the storyboard itself. It runs `--prepare`, writes `plan.json`, records, then reviews the rendered video before handing it over.

## Why the video is shaped this way

What the research on product demos says, and where each finding lives in the code:

| Finding | Implementation |
| --- | --- |
| The first 3–5 seconds decide whether people keep watching. Open on the pain or the outcome, never a logo or "Introducing". | **Hook**: the pain line, word by word, on black. The schema forbids using the product name. |
| Lead with the problem. Show why current solutions fail, precisely rather than dramatically. | **Old way**: the real status-quo workflow, step by step. Every step is costed (`+4m`), a red clock counts the total, the quantified stats slam in, and a verdict is stamped over the pile. |
| One killer workflow, not a feature tour. Real product, real data, aha within ~20s. | **New way**: a single recorded task that does the *same job* as the old way. One `emphasis` action triggers a flash, glow and pull-back reveal. |
| Before/after contrast (the Slack and Airtable pattern). | A green real-time clock runs next to the struck-out red old-way time throughout the recording. **Compare** uses the same dimensions as the old-way stats. |
| Sell what only you can do. | **Only-us**: "Only X…" plus three *mechanisms* taken from the README/code, not adjectives. |
| Zooms, cursor focus, fast pacing, sped-up waits. | Camera keyframes come from each action's bounding box, waits are speed-ramped up to 8×, and the cursor is redrawn with easing. |
| Most autoplay is muted. Keep on-screen text short. | Everything is burned-in text with tight word limits enforced by the schema. Music is optional (`--music`). |
| Under 60–90s for awareness demos. End on one low-commitment CTA. | Typical output is 35–60s, ending on a single CTA with the URL or install command. |

The "N× faster" headline is **computed**: the total cost of the old-way steps divided by the measured wall-clock time of the recorded workflow.

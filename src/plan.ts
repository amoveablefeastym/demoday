import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { DemoPlan } from "./schema.ts";
import type { RepoInfo } from "./github.ts";
import type { Probe } from "./probe.ts";

const MODEL = "claude-opus-5-5";

/**
 * The research distilled into rules. This is what makes the output a demo
 * people finish watching instead of a feature tour.
 */
export const SYSTEM = `You are a launch-video director who writes 45-75 second product demos that people watch to the end and then share.

What separates great demos (Linear, Vercel, Figma, Slack before/after) from the ones people close:
1. HOOK IN 3 SECONDS. Open on the pain or a bold outcome. Never the logo, never "Introducing", never the product name.
2. MAKE THE STATUS QUO HURT — specifically. Name the exact workflow the audience uses today and walk it step by step so the viewer winces in recognition. Quantify it: minutes, clicks, tools, dollars, error rate. Vague pain ("it's hard") persuades nobody; counted pain does. Be precise and fair, not dramatic: no false claims about named competitors.
3. ONE KILLER WORKFLOW, NOT A FEATURE TOUR. Do the SAME job the old way did, start to finish, in the real product, with realistic data. Reach the aha moment within ~20 seconds of the product appearing. No login, settings, or onboarding screens.
4. PROVE THE DIFFERENCE APPLES-TO-APPLES. The before/after table uses the same dimensions as the old-way stats so the gap is undeniable.
5. SAY WHAT ONLY YOU CAN DO. The "special" beat names the mechanism (from the README/code) that makes this possible — why incumbents can't just copy the button. Mechanisms and proofs, not adjectives ("runs entirely in your browser", not "blazing fast").
6. VIEWERS ARE MUTED. Every beat must read as text in <= 9 words. Captions state outcomes, not UI mechanics.
7. END ON ONE LOW-COMMITMENT CTA.

Recording rules for newWay.actions (they become a Playwright script run against the live site):
- First action is {kind:"goto", value:<live url>}.
- Targets MUST come from the accessibility snapshot you are given. Prefer role+name copied verbatim; then label/placeholder; then text; css only as a last resort.
- Only use elements you can see in the snapshot or that will plausibly appear right after a previous action on the same page. Keep it to 3-8 actions.
- fill values are realistic, specific, and short enough to type in ~3 seconds (<= 60 chars), unless the payoff needs a paste-sized input.
- Mark exactly one action emphasis:true — the moment the payoff appears.

Native macOS apps (the snapshot lists AX roles like AXButton/AXTextArea with id=… and window-relative @x,y frames):
- Do NOT start with goto; the app is already open on its first screen.
- Target by id when present, then placeholder, then role+name (role can be "button"/"textbox" or the AX role), then text.
- fill without a target types into the focused field; use {kind:"press", value:"Enter"} to submit, "Meta+N"-style combos for shortcuts.
- The recorder drives the real mouse and keyboard, so keep it to the app's own window: no menus bar items, no system dialogs.`;

export function buildUserContent(repo: RepoInfo, p: Probe): Anthropic.Beta.BetaContentBlockParam[] {
  const MAX_README = 80_000;
  if (repo.readme.length > MAX_README) {
    console.warn(`  ! README is ${repo.readme.length} chars; sending the first ${MAX_README}.`);
  }
  const tree = repo.tree.length > 400 ? [...repo.tree.slice(0, 400), `… (+${repo.tree.length - 400} more files)`] : repo.tree;
  const text = `# Repository: ${repo.fullName}
Description: ${repo.description}
Homepage: ${repo.homepage}
Stars: ${repo.stars}  Language: ${repo.language}  Topics: ${repo.topics.join(", ")}

## README
${repo.readme.slice(0, MAX_README)}

## Manifests
${Object.entries(repo.manifests)
  .map(([f, c]) => `### ${f}\n${c.slice(0, 4000)}`)
  .join("\n\n")}

## File tree
${tree.join("\n")}

# ${p.native ? "Native macOS app" : "Live app"}: ${p.url}
Title: ${p.title}
theme-color: ${p.themeColor ?? "(none)"}

## Accessibility snapshot of the ${p.native ? "app window on launch" : "landing view"} (use these names for selectors)
${p.aria}

The screenshot of the landing view is attached. Write the storyboard.`;

  const parts: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (p.screenshot.length) parts.push({ type: "image", source: { type: "base64", media_type: "image/png", data: p.screenshot.toString("base64") } });
  parts.push({ type: "text", text });
  return parts;
}

export async function writePlan(repo: RepoInfo, p: Probe, feedback?: string): Promise<DemoPlan> {
  const client = new Anthropic();
  const content = buildUserContent(repo, p);
  if (feedback) content.push({ type: "text", text: feedback });

  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(DemoPlan) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  if (res.stop_reason === "refusal") throw new Error("Claude declined to write this storyboard.");
  if (res.stop_reason === "max_tokens") throw new Error("Storyboard was cut off (max_tokens).");
  if (!res.parsed_output) throw new Error("Claude returned a storyboard that failed schema validation.");
  return res.parsed_output;
}

/** Ask Claude to repair only the recording steps after a run reports failures. */
export function repairFeedback(failures: Array<{ index: number; error: string; aria: string }>, plan: DemoPlan): string {
  return `A previous storyboard was recorded and some actions FAILED on the live site. Keep everything that worked and the story beats, but fix newWay.actions.

Previous newWay.actions:
${JSON.stringify(plan.newWay.actions, null, 2)}

Failures (with the accessibility snapshot at the moment of failure):
${failures.map((f) => `--- action #${f.index}: ${f.error}\n${f.aria}`).join("\n\n")}`;
}

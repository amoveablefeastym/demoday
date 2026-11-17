#!/usr/bin/env -S npx tsx
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fetchRepo, isLocal, parseRepo, readLocalRepo, type RepoInfo } from "./github.ts";
import { probeNative, recordNative, type NativeOpts } from "./native.ts";
import { probe } from "./probe.ts";
import { SYSTEM, buildUserContent, repairFeedback, writePlan } from "./plan.ts";
import { generateScript } from "./codegen.ts";
import { editRecording } from "./edit.ts";
import { renderVideo } from "./render.ts";
import { DemoPlan } from "./schema.ts";

const STAGES = ["fetch", "plan", "record", "render"] as const;
type Stage = (typeof STAGES)[number];

const HELP = `DemoDay — repo in, launch demo video out.

  npx tsx src/cli.ts <github-url | owner/repo | ./local/dir> [options]

  --url <url>        Live web app to record (default: the repo's homepage)
  --app <X.app>      Record a native macOS app instead of a website
  -- <app args…>     Everything after a bare -- is passed to the app at launch.
                     {data} = a fresh throwaway data dir per run, so real user data is
                     never touched, e.g.  --app Foo.app -- --demo {data}
  --app-seed <path>  File or folder copied into {data} before each run (demo content)
  --out <dir>        Working dir (default: out/<repo>)
  --plan <file>      Use this storyboard instead of asking Claude
  --from <stage>     Resume from: ${STAGES.join(" | ")}  (reuses earlier artifacts)
  --retries <n>      Self-repair attempts when recorded steps fail (default 2)
  --music <file>     Background track (mp3/wav)
  --no-sfx           No sound effects (typing, clicks, whooshes)
  --headed           Watch the browser while recording
  --prepare          Only read the repo + probe the site, write prompt.md, then stop
                     (for writing plan.json yourself, e.g. from the Claude Code skill)

Needs ANTHROPIC_API_KEY for the storyboard (or pass --plan). GITHUB_TOKEN optional.`;

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string" },
    out: { type: "string" },
    plan: { type: "string" },
    from: { type: "string", default: "fetch" },
    retries: { type: "string", default: "2" },
    music: { type: "string" },
    "no-sfx": { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
    prepare: { type: "boolean", default: false },
    app: { type: "string" },
    "app-seed": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (o.help || !positionals[0]) {
  console.log(HELP);
  process.exit(o.help ? 0 : 1);
}

const repoArg = positionals[0];
const out = resolve(o.out ?? join("out", parseRepo(repoArg).replace("/", "__")));
mkdirSync(out, { recursive: true });
// record.ts lives in the out dir; make sure it can resolve playwright from anywhere.
const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
if (!out.startsWith(ROOT + "/") && !existsSync(join(out, "node_modules"))) symlinkSync(join(ROOT, "node_modules"), join(out, "node_modules"));
const from = STAGES.indexOf(o.from as Stage);
if (from < 0) throw new Error(`--from must be one of ${STAGES.join(", ")}`);
const runs = (s: Stage) => STAGES.indexOf(s) >= from;
const file = (n: string) => join(out, n);
const readJson = (n: string) => JSON.parse(readFileSync(file(n), "utf8"));
const saveJson = (n: string, v: unknown) => writeFileSync(file(n), JSON.stringify(v, null, 2));
const say = (s: string) => console.log(`\n▸ ${s}`);

// 1. Read the repo ----------------------------------------------------------
let repo: RepoInfo;
if (runs("fetch")) {
  say(`Reading ${parseRepo(repoArg)}${isLocal(repoArg) ? "" : " from GitHub"}`);
  repo = isLocal(repoArg) ? readLocalRepo(repoArg) : await fetchRepo(repoArg);
  saveJson("repo.json", repo);
  console.log(`  ${repo.description || "(no description)"} · ★ ${repo.stars} · ${repo.tree.length} files`);
} else repo = readJson("repo.json");

const liveUrl = o.url ?? repo.homepage;
const native: NativeOpts | null = o.app ? { app: o.app, appArgs: positionals.slice(1), seed: o["app-seed"] } : null;

// 2. Probe the live app + write the storyboard ------------------------------
let plan: DemoPlan;
const probeLive = async () => {
  if (native) {
    say(`Probing ${basename(native.app)} (native)`);
    return probeNative(out, native);
  }
  if (!liveUrl) throw new Error("The repo has no homepage URL. Pass the live app with --url.");
  say(`Probing ${liveUrl}`);
  const p = await probe(liveUrl);
  writeFileSync(file("probe.png"), p.screenshot);
  writeFileSync(file("probe.aria.yml"), p.aria);
  return p;
};
const hasClaude = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

if (runs("plan")) {
  if (o.plan) {
    plan = DemoPlan.parse(JSON.parse(readFileSync(o.plan, "utf8")));
    say(`Using storyboard ${o.plan}`);
  } else {
    const p = await probeLive();
    if (o.prepare || !hasClaude) {
      const content = buildUserContent(repo, p);
      writeFileSync(file("prompt.md"), `${SYSTEM}\n\n---\n\n${content.map((c) => (c.type === "text" ? c.text : "[screenshot: probe.png]")).join("\n")}`);
      if (o.prepare) {
        const argv = process.argv.slice(2).filter((x) => x !== "--prepare");
        const sep = argv.includes("--") ? argv.indexOf("--") : argv.length;
        const resume = [...argv.slice(0, sep), "--out", out, "--plan", file("plan.json"), "--from", "plan", ...argv.slice(sep)];
        console.log(`\n  Prepared ${out}\n  Read prompt.md + probe.png, write plan.json (schema: src/schema.ts), then:\n  npx tsx src/cli.ts ${resume.map((x) => (/[\s{}]/.test(x) ? `'${x}'` : x)).join(" ")}`);
        process.exit(0);
      }
      console.error(`\n  ANTHROPIC_API_KEY is not set. Wrote the full storyboard prompt to ${file("prompt.md")}.
  Set the key and re-run, or write plan.json yourself (schema: src/schema.ts) and pass --plan.`);
      process.exit(2);
    }
    say("Directing the storyboard with Claude");
    plan = await writePlan(repo, p);
  }
  saveJson("plan.json", plan);
  console.log(`  Hook:    "${plan.hook.line}"`);
  console.log(`  Old way: ${plan.oldWay.label} (${plan.oldWay.steps.length} steps)`);
  console.log(`  New way: ${plan.newWay.actions.length} actions → "${plan.newWay.task}"`);
  console.log(`  Only:    ${plan.special.headline}`);
} else plan = DemoPlan.parse(readJson("plan.json"));

// 3. Generate the Playwright script, record, self-repair --------------------
if (runs("record")) {
  const retries = Number(o.retries);
  for (let attempt = 0; ; attempt++) {
    if (native) {
      say(`Recording ${basename(native.app)}${attempt ? ` (repair #${attempt})` : ""}`);
      recordNative(out, plan, native);
    } else {
      writeFileSync(file("record.ts"), generateScript(plan));
      say(`Recording ${plan.product.url} (record.ts${attempt ? `, repair #${attempt}` : ""})`);
      execFileSync("npx", ["tsx", file("record.ts"), out, ...(o.headed ? ["--headed"] : [])], { stdio: "inherit" });
    }
    const { failures } = readJson("events.json");
    if (!failures.length) break;
    if (!hasClaude || attempt >= retries) {
      console.warn(`  ! ${failures.length} action(s) failed; continuing with what recorded. Edit ${file("record.ts")} or plan.json and re-run with --from record.`);
      break;
    }
    say("Asking Claude to repair the failed steps");
    plan = await writePlan(repo, await probeLive(), repairFeedback(failures, plan));
    saveJson("plan.json", plan);
  }
  say("Editing: trimming dead air, speed-ramping waits");
  const tl = editRecording(out);
  console.log(`  ${tl.realSeconds.toFixed(1)}s real → ${tl.duration.toFixed(1)}s on screen, ${tl.actionsDone} actions`);
}

// 4. Assemble in Remotion ----------------------------------------------------
if (runs("render")) {
  const accent = /^#[0-9a-f]{6}$/i.test(plan.product.accent) ? plan.product.accent : "#7C5CFF";
  let music: string | undefined;
  if (o.music) {
    music = basename(o.music);
    copyFileSync(o.music, file(music));
  }
  const sfx = !o["no-sfx"];
  if (sfx) {
    const src = fileURLToPath(new URL("../assets/sfx/", import.meta.url));
    if (!existsSync(join(src, "click.wav"))) execFileSync("python3", [fileURLToPath(new URL("../scripts/make-sfx.py", import.meta.url)), src]);
    mkdirSync(file("sfx"), { recursive: true });
    for (const f of readdirSync(src)) if (f.endsWith(".wav")) copyFileSync(join(src, f), join(file("sfx"), f));
  }
  // Brand assets from the app (fonts, mascot image): copy next to the video, point the plan at the copies.
  const look = plan.look ? { ...plan.look } : undefined;
  if (look) {
    mkdirSync(file("brand"), { recursive: true });
    for (const [key, name] of [["fontFile", "display"], ["bodyFontFile", "body"], ["motifImage", "motif"]] as const) {
      const p = look[key];
      if (!p || p.startsWith("brand/")) continue;
      const src = [resolve(p), ...(isLocal(repoArg) ? [resolve(repoArg, p)] : [])].find((c) => existsSync(c));
      if (!src) { console.log(`  ! look.${key}: ${p} not found, skipping`); delete look[key]; continue; }
      const dest = `brand/${name}${src.slice(src.lastIndexOf("."))}`;
      copyFileSync(src, file(dest));
      look[key] = dest;
    }
  }
  const timeline = readJson("timeline.json");
  const props = {
    sfx,
    plan: { ...plan, product: { ...plan.product, accent }, ...(look ? { look } : {}) },
    timeline,
    repo: { fullName: repo.fullName, stars: repo.stars },
    video: timeline.video ?? "raw.webm",
    ...(music ? { music } : {}),
  };
  saveJson("props.json", props);
  say("Assembling the video in Remotion");
  const r = await renderVideo(out, props);
  console.log(`\n✔ ${r.output}  (${r.seconds.toFixed(1)}s)\n  Review stills: ${r.stillsDir}
  Tweak live: npx remotion studio remotion/index.ts --public-dir ${out} --props ${file("props.json")}`);
}
if (!existsSync(file("demo.mp4")) && runs("render")) process.exit(1);

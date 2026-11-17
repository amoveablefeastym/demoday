import { Audio, Sequence, staticFile } from "remotion";
import { FPS, sceneFrames, sceneStarts } from "./timing.ts";
import { theme } from "./lib.ts";
import { LAUNCH } from "./scenes/Launcher.tsx";
import type { Props } from "./lib.ts";

type Hit = { at: number; src: string; vol: number };

/** Same cadence both recorders type at (macdriver typeText / Playwright keyboard.type). */
const keyDelay = (len: number) => Math.max(0.018, Math.min(0.055, 2.6 / Math.max(1, len)));
const PASTE_OVER = 80;

/** Deterministic jitter so every render sounds the same. */
const rand = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export function sfxHits(props: Props): Hit[] {
  const { plan, timeline: tl } = props;
  const f = sceneFrames(props);
  const s = sceneStarts(props);
  const soft = theme(plan).soft;
  const hits: Hit[] = [];
  const add = (frame: number, src: string, vol: number) => hits.push({ at: Math.max(0, Math.round(frame)), src, vol });

  // Scene changes: a whoosh as each transition starts.
  for (const k of ["oldWay", "turn", "launcher", "compare", "special", "cta"] as const) if (k !== "launcher" || f.launcher) add(s[k], "whoosh", soft ? 0.16 : 0.3);
  if (!f.launcher) add(s.newWay, "whoosh", soft ? 0.16 : 0.3);
  else {
    add(s.launcher + LAUNCH.click, "click", 0.75);
    add(s.launcher + LAUNCH.open + 2, "pop", 0.4);
  }

  // Old way: each pain card lands with a thud, stats pop, the verdict stamps.
  const STEP0 = 30, PER = 24;
  const steps = plan.oldWay.steps.length;
  for (let i = 0; i < steps; i++) add(s.oldWay + STEP0 + i * PER, soft ? "pop" : "thud", soft ? 0.3 : 0.45);
  if (!soft) for (let i = 0; i < plan.oldWay.stats.length; i++) add(s.oldWay + STEP0 + steps * PER + i * 14, "pop", 0.3);
  add(s.oldWay + f.oldWay - 60, soft ? "pop" : "stamp", soft ? 0.35 : 0.75);

  // New way: real interactions, timed off the recording.
  const nw = s.newWay;
  const clicks = tl.cursor.filter((c) => c.click);
  for (const c of clicks) add(nw + c.t * FPS, "click", 0.75);
  let k = 0;
  for (const e of tl.events) {
    const action = e.index != null ? plan.newWay.actions[e.index] : undefined;
    if (e.kind === "fill") {
      const text = action?.value ?? "";
      if (!text || text.length > PASTE_OVER) continue; // pasted: the click/paste is enough
      const clickIn = clicks.filter((c) => c.t >= e.t - 0.05 && c.t <= e.end).at(-1);
      let t = clickIn ? clickIn.t + 0.12 : e.t + 0.02;
      const d = keyDelay(text.length);
      for (const ch of text) {
        if (ch !== "\n") add(nw + t * FPS, ch === " " ? "space" : `key${1 + (k % 4)}`, ch === " " ? 0.55 : 0.4 + 0.15 * rand(k));
        else add(nw + t * FPS, "enter", 0.45);
        t += d;
        k++;
      }
    } else if (e.kind === "press") {
      const key = (action?.value ?? "Enter").toLowerCase();
      add(nw + (e.t + 0.02) * FPS, key.includes("enter") || key.includes("return") ? "enter" : `key${1 + (k++ % 4)}`, 0.45);
    }
  }
  const aha = tl.events.find((e) => e.emphasis);
  if (aha) add(nw + (aha.t + 0.7) * FPS, "chime", 0.5);

  // Before/after: each row pops in, the "N× faster" lands.
  plan.compare.forEach((_, i) => add(s.compare + 30 + i * 14, "pop", 0.3));
  add(s.compare + 30 + plan.compare.length * 14 + 16, soft ? "chime" : "stamp", soft ? 0.3 : 0.5);

  // Only-us points pop in.
  for (let i = 0; i < 3; i++) add(s.special + 30 + i * 10, "pop", 0.25);
  return hits;
}

export const Sfx: React.FC<Props> = (props) => (
  <>
    {sfxHits(props).map((h, i) => (
      <Sequence key={i} from={h.at} durationInFrames={FPS * 2} layout="none">
        <Audio src={staticFile(`sfx/${h.src}.wav`)} volume={h.vol} />
      </Sequence>
    ))}
  </>
);

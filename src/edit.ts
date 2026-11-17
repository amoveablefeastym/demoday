import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline } from "./schema.ts";

type Raw = {
  width: number;
  height: number;
  end: number;
  events: Array<{ kind: any; caption: string; emphasis: boolean; t: number; end: number; box?: any; index?: number }>;
  cursor: Timeline["cursor"];
  failures: unknown[];
  video?: string;
  chrome?: "browser" | "window";
};

type Seg = { s: number; e: number; rate: number };

const PRE = 0.7; // keep real-time this long before each action (cursor travel reads)
const POST = 0.5; // ...and after it
const MAX_RATE = 8;

/**
 * Cut the recording like an editor would: start once the page is painted,
 * play every interaction in real time, fast-forward the waiting in between,
 * end on the payoff. Remotion plays raw.webm per segment (trimBefore + playbackRate),
 * so no transcode is needed. Returns the remapped timeline it animates against.
 */
export function editRecording(dir: string): Timeline {
  const raw: Raw = JSON.parse(readFileSync(join(dir, "events.json"), "utf8"));
  if (!raw.events.length) throw new Error("No actions were recorded successfully — nothing to edit.");

  const first = raw.events[0];
  const clipStart = first.kind === "goto" ? Math.max(0, first.end - 0.4) : 0;
  const clipEnd = Math.min(raw.end, raw.events.at(-1)!.end + 0.6);

  // Real-time windows around each interaction, merged.
  const windows = raw.events
    .filter((e) => e.kind !== "goto" && (e.kind !== "wait" || e.emphasis))
    .map((e) => ({ s: Math.max(clipStart, e.t - PRE), e: Math.min(clipEnd, e.end + POST) }))
    .sort((a, b) => a.s - b.s);
  const merged: { s: number; e: number }[] = [];
  for (const w of windows) {
    const last = merged.at(-1);
    if (last && w.s <= last.e) last.e = Math.max(last.e, w.e);
    else merged.push({ ...w });
  }

  const segs: Seg[] = [];
  let cur = clipStart;
  const gap = (s: number, e: number) => {
    const len = e - s;
    if (len <= 0.01) return;
    // Short gaps stay real-time; long ones compress to ~0.6s, capped at MAX_RATE.
    const rate = len < 1.2 ? 1 : Math.min(MAX_RATE, Math.max(2, len / 0.6));
    segs.push({ s, e, rate });
  };
  for (const w of merged) {
    gap(cur, w.s);
    segs.push({ s: Math.max(cur, w.s), e: w.e, rate: 1 });
    cur = w.e;
  }
  gap(cur, clipEnd);

  // src time -> output time
  const outStarts: number[] = [];
  let acc = 0;
  for (const g of segs) {
    outStarts.push(acc);
    acc += (g.e - g.s) / g.rate;
  }
  const map = (t: number) => {
    if (t <= segs[0].s) return 0;
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      if (t <= g.e) return outStarts[i] + (t - g.s) / g.rate;
    }
    return acc;
  };

  const timeline: Timeline = {
    chrome: raw.chrome ?? "browser",
    video: raw.video ?? "raw.webm",
    width: raw.width,
    height: raw.height,
    duration: acc,
    realSeconds: clipEnd - clipStart,
    actionsDone: raw.events.filter((e) => e.kind !== "goto" && e.kind !== "wait").length,
    events: raw.events.map((e) => ({
      t: map(e.t),
      end: map(e.end),
      kind: e.kind,
      caption: e.caption,
      emphasis: e.emphasis,
      box: e.box,
      index: e.index,
      realT: Math.max(0, e.t - clipStart),
    })),
    cursor: raw.cursor.map((c) => ({ ...c, t: map(c.t) })),
    segments: segs.map((g, i) => ({ t: outStarts[i], end: outStarts[i] + (g.e - g.s) / g.rate, src: g.s - clipStart, rawSrc: g.s, rate: g.rate })),
  };
  writeFileSync(join(dir, "timeline.json"), JSON.stringify(timeline, null, 2));
  return timeline;
}

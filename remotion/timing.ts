// Pure timing math (no fonts/DOM), shared by the Remotion composition and the Node renderer.
import type { DemoPlan, Timeline } from "../src/schema.ts";

export const FPS = 30;
export const TRANSITION = 14;

type TimingInput = { plan: DemoPlan; timeline: Timeline };

/** Scene lengths in frames: single source of truth. */
export function sceneFrames(p: TimingInput) {
  const steps = p.plan.oldWay.steps.length;
  return {
    hook: 96,
    oldWay: 30 + steps * 24 + 54 + 60,
    turn: 66,
    launcher: p.plan.launcher ? 150 : 0,
    newWay: Math.ceil(p.timeline.duration * FPS) + 24,
    compare: 240,
    special: 140,
    cta: 120,
  };
}

export const totalFrames = (p: TimingInput) => {
  const f = Object.values(sceneFrames(p)).filter((x) => x > 0);
  return f.reduce((a, b) => a + b, 0) - TRANSITION * (f.length - 1);
};

/** Frame where each scene starts in the final video (transitions overlap scenes). */
export function sceneStarts(p: TimingInput) {
  const f = sceneFrames(p);
  const T = TRANSITION;
  const s = { hook: 0, oldWay: f.hook - T } as Record<keyof typeof f, number>;
  s.turn = s.oldWay + f.oldWay - T;
  s.launcher = s.turn + f.turn - T;
  s.newWay = f.launcher ? s.launcher + f.launcher - T : s.launcher;
  s.compare = s.newWay + f.newWay - T;
  s.special = s.compare + f.compare - T;
  s.cta = s.special + f.special - T;
  return s;
}

/** One review frame per beat, at the moment each beat is fully built. */
export function reviewFrames(p: TimingInput): Record<string, number> {
  const f = sceneFrames(p);
  const start = sceneStarts(p);
  const aha = p.timeline.events.find((e) => e.emphasis);
  return {
    "1-hook": start.hook + 80,
    "2-oldway": start.oldWay + f.oldWay - 66,
    "3-verdict": start.oldWay + f.oldWay - 20,
    "4-turn": start.turn + 50,
    ...(f.launcher ? { "4b-launcher": start.launcher + 100 } : {}),
    "5-newway-start": start.newWay + 40,
    "6-newway-aha": start.newWay + Math.round(((aha?.t ?? p.timeline.duration / 2) + 1) * FPS),
    "7-newway-end": start.newWay + f.newWay - 20,
    "8-compare": start.compare + f.compare - 20,
    "9-special": start.special + f.special - 20,
    "10-cta": start.cta + f.cta - 20,
  };
}

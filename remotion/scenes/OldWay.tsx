import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, MONO, SANS, fadeIn, fmtClock, pop, rand } from "../lib.ts";
import type { Props } from "../lib.ts";

const PAIN_LABEL = {
  slow: "SLOW",
  error: "ERROR-PRONE",
  "context-switch": "CONTEXT SWITCH",
  cost: "COSTS MONEY",
  manual: "MANUAL",
} as const;

const fmtCost = (s: number) => (s >= 60 ? `+${Math.floor(s / 60)}m${s % 60 ? ` ${Math.round(s % 60)}s` : ""}` : `+${Math.round(s)}s`);

/**
 * Make the status quo hurt, specifically: every step lands like another
 * window piling up, a red clock counts the time it eats, then a verdict is
 * stamped over the mess.
 */
export const OldWay: React.FC<Props> = ({ plan }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { steps, stats, label, verdict } = plan.oldWay;
  const STEP0 = 30;
  const PER = 24;
  const statsAt = STEP0 + steps.length * PER;
  const verdictAt = durationInFrames - 60;

  // Cumulative clock: rolls up as each step lands.
  const cum = steps.reduce<number[]>((a, s) => [...a, (a.at(-1) ?? 0) + s.seconds], []);
  let clock = 0;
  steps.forEach((_, i) => {
    const k = interpolate(frame, [STEP0 + i * PER, STEP0 + i * PER + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    clock = k > 0 ? (i ? cum[i - 1] : 0) + k * steps[i].seconds : clock;
  });
  const landed = Math.max(0, Math.min(steps.length, Math.floor((frame - STEP0) / PER) + 1));

  // Camera shake that kicks on each landing and decays.
  const sinceLand = (frame - STEP0) % PER;
  const shakeAmp = frame >= STEP0 && frame < statsAt ? Math.max(0, 9 - sinceLand * 1.1) : 0;
  const shakeX = Math.sin(frame * 2.7) * shakeAmp;
  const shakeY = Math.cos(frame * 3.1) * shakeAmp * 0.6;

  const verdictK = pop(frame, fps, verdictAt, 11);
  const gloom = interpolate(frame, [verdictAt - 4, verdictAt + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 30% 60%, ${C.badDeep}, ${C.ink} 70%)`, fontFamily: SANS }}>
      <AbsoluteFill style={{ transform: `translate(${shakeX}px, ${shakeY}px)`, filter: `grayscale(${gloom * 0.7}) brightness(${1 - gloom * 0.45})` }}>
        {/* Header */}
        <div style={{ position: "absolute", left: 120, top: 70, display: "flex", alignItems: "center", gap: 26, opacity: fadeIn(frame, 0, 10) }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: C.ink, background: C.bad, padding: "8px 18px", borderRadius: 8, letterSpacing: 2 }}>
            THE WAY YOU DO IT TODAY
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, color: C.paper }}>{label}</div>
        </div>

        {/* Pile of steps */}
        {steps.map((s, i) => {
          const at = STEP0 + i * PER;
          const k = pop(frame, fps, at, 12);
          if (frame < at) return null;
          const rot = (rand(i) - 0.5) * 6;
          const x = 120 + rand(i + 7) * 70;
          const y = 190 + i * (steps.length > 5 ? 124 : 140);
          const buried = landed - 1 - i; // how many cards landed after this one
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: 1000,
                height: 112,
                transform: `translateY(${(1 - k) * -60}px) scale(${1 + (1 - k) * 0.18}) rotate(${rot}deg)`,
                opacity: Math.min(1, k * 1.4) * (buried > 0 ? Math.max(0.55, 1 - buried * 0.12) : 1),
                background: "#16161D",
                border: "1px solid #2B2B35",
                borderLeft: `8px solid ${C.bad}`,
                borderRadius: 14,
                boxShadow: "0 30px 60px rgba(0,0,0,.55)",
                display: "flex",
                alignItems: "center",
                padding: "0 34px",
                gap: 28,
              }}
            >
              <div style={{ fontFamily: MONO, fontSize: 30, color: C.dim, width: 48 }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 40, fontWeight: 700, color: C.paper, lineHeight: 1.1 }}>{s.text}</div>
                <div style={{ fontFamily: MONO, fontSize: 18, color: C.bad, letterSpacing: 2, marginTop: 6 }}>{PAIN_LABEL[s.pain]}</div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: C.bad }}>{fmtCost(s.seconds)}</div>
            </div>
          );
        })}

        {/* Counters */}
        <div style={{ position: "absolute", right: 120, top: 200, width: 520, textAlign: "right" }}>
          <div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 4, color: C.dim }}>TIME SPENT</div>
          <div style={{ fontFamily: MONO, fontSize: 150, fontWeight: 700, color: C.bad, lineHeight: 1, letterSpacing: -4, textShadow: `0 0 40px ${C.bad}55` }}>
            {fmtClock(clock)}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 4, color: C.dim, marginTop: 30 }}>STEPS</div>
          <div style={{ fontFamily: MONO, fontSize: 90, fontWeight: 700, color: C.paper, lineHeight: 1 }}>{landed}</div>

          {stats.map((st, i) => {
            const k = pop(frame, fps, statsAt + i * 14, 10);
            return (
              <div key={i} style={{ marginTop: i ? 18 : 46, opacity: k, transform: `translateX(${(1 - k) * 80}px) scale(${1 + (1 - k) * 0.4})` }}>
                <span style={{ fontSize: 64, fontWeight: 900, color: C.bad }}>{st.value}</span>
                <span style={{ fontSize: 30, fontWeight: 600, color: C.paper, marginLeft: 16 }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* Verdict stamp */}
      {frame >= verdictAt && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div
            style={{
              transform: `rotate(-5deg) scale(${2.4 - verdictK * 1.4})`,
              opacity: Math.min(1, verdictK * 2),
              border: `10px solid ${C.bad}`,
              borderRadius: 18,
              padding: "26px 56px",
              color: C.bad,
              fontSize: 104,
              fontWeight: 900,
              letterSpacing: -2,
              textTransform: "uppercase",
              background: "rgba(8,8,11,.75)",
              maxWidth: 1600,
              textAlign: "center",
              lineHeight: 1,
            }}
          >
            {verdict}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

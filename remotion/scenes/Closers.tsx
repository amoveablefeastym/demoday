import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, MONO, SANS, fadeIn, fmtDuration, pop } from "../lib.ts";
import type { Props } from "../lib.ts";

/** The pivot: one line, then the name lands. */
export const Turn: React.FC<Props> = ({ plan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = plan.product.accent;
  const k1 = pop(frame, fps, 0, 14);
  const k2 = pop(frame, fps, 26, 12);
  const bar = interpolate(frame, [22, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.ink, justifyContent: "center", alignItems: "center", fontFamily: SANS, textAlign: "center" }}>
      <div style={{ fontSize: 64, fontWeight: 700, color: C.dim, opacity: k1, transform: `translateY(${(1 - k1) * 20}px)` }}>{plan.turn}</div>
      <div style={{ height: 6, width: 700 * bar, background: accent, borderRadius: 3, margin: "34px 0", boxShadow: `0 0 40px ${accent}` }} />
      <div style={{ fontSize: 150, fontWeight: 900, color: C.paper, letterSpacing: -5 + (1 - k2) * 30, opacity: k2, lineHeight: 1 }}>
        {plan.product.name}
      </div>
      <div style={{ fontSize: 42, fontWeight: 600, color: accent, marginTop: 22, opacity: fadeIn(frame, 36, 12) }}>{plan.product.tagline}</div>
    </AbsoluteFill>
  );
};

/** Apples-to-apples. The headline multiplier is computed from the recording, not claimed. */
export const Compare: React.FC<Props> = ({ plan, timeline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = plan.product.accent;
  const oldSec = plan.oldWay.steps.reduce((a, s) => a + s.seconds, 0);
  const newSec = Math.max(1, timeline.realSeconds);
  const factor = Math.round(oldSec / newSec);
  const heroAt = 30 + plan.compare.length * 14 + 16;
  const hero = pop(frame, fps, heroAt, 11);
  const col = { dim: 420, old: 560, new: 560 };

  return (
    <AbsoluteFill style={{ background: C.ink, fontFamily: SANS, alignItems: "center" }}>
      <div style={{ marginTop: 80, fontSize: 30, fontFamily: MONO, letterSpacing: 4, color: C.dim, opacity: fadeIn(frame, 0) }}>SAME JOB</div>
      <div style={{ fontSize: 58, fontWeight: 800, color: C.paper, marginTop: 10, opacity: fadeIn(frame, 4), maxWidth: 1600, textAlign: "center" }}>
        {plan.newWay.task}
      </div>

      <div style={{ marginTop: 50 }}>
        <div style={{ display: "flex", fontFamily: MONO, fontSize: 24, letterSpacing: 3, paddingBottom: 14, borderBottom: "1px solid #2a2a33", opacity: fadeIn(frame, 12) }}>
          <div style={{ width: col.dim }} />
          <div style={{ width: col.old, color: C.bad }}>BEFORE</div>
          <div style={{ width: col.new, color: accent }}>WITH {plan.product.name.toUpperCase()}</div>
        </div>
        {plan.compare.map((r, i) => {
          const a = 30 + i * 14;
          const k = pop(frame, fps, a, 14);
          const strike = interpolate(frame, [a + 8, a + 18], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", height: 92, borderBottom: "1px solid #1d1d25", opacity: k, transform: `translateY(${(1 - k) * 24}px)` }}>
              <div style={{ width: col.dim, fontSize: 34, fontWeight: 600, color: C.dim }}>{r.dimension}</div>
              <div style={{ width: col.old, fontSize: 40, fontWeight: 700, color: "#B9B9C4", position: "relative" }}>
                <span style={{ position: "relative" }}>
                  {r.old}
                  <span style={{ position: "absolute", left: 0, top: "52%", height: 5, width: `${strike}%`, background: C.bad, borderRadius: 3 }} />
                </span>
              </div>
              <div style={{ width: col.new, fontSize: 44, fontWeight: 800, color: C.paper, display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ color: accent, transform: `scale(${pop(frame, fps, a + 14, 9)})`, display: "inline-block" }}>✓</span>
                {r.new}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ position: "absolute", bottom: 90, display: "flex", alignItems: "baseline", gap: 36, opacity: hero, transform: `scale(${0.7 + hero * 0.3})` }}>
        <span style={{ fontSize: 76, fontWeight: 800, color: C.bad, textDecoration: "line-through", textDecorationThickness: 6 }}>{fmtDuration(oldSec)}</span>
        <span style={{ fontSize: 76, color: C.dim }}>→</span>
        <span style={{ fontSize: 96, fontWeight: 900, color: C.good }}>{fmtDuration(newSec)}</span>
        {factor >= 2 && (
          <span style={{ fontSize: 50, fontWeight: 900, color: C.ink, background: accent, padding: "6px 22px", borderRadius: 14, marginLeft: 20 }}>
            {factor}× faster
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** What only this product can do, and why: the mechanism. */
export const Special: React.FC<Props> = ({ plan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = plan.product.accent;
  const words = plan.special.headline.split(/\s+/);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1100px 600px at 50% 0%, ${accent}30, ${C.ink} 70%)`, fontFamily: SANS, alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 92, fontWeight: 900, letterSpacing: -2.5, color: C.paper, textAlign: "center", maxWidth: 1650, lineHeight: 1.05 }}>
        {words.map((w, i) => {
          const k = pop(frame, fps, i * 3, 14);
          const hot = i === 0 && /^only$/i.test(w);
          return (
            <span key={i} style={{ display: "inline-block", marginRight: "0.25em", opacity: k, transform: `translateY(${(1 - k) * 30}px)`, color: hot ? accent : undefined }}>
              {w}
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 30, marginTop: 80 }}>
        {plan.special.points.map((p, i) => {
          const k = pop(frame, fps, 30 + i * 10, 13);
          return (
            <div
              key={i}
              style={{
                width: 500,
                padding: "34px 36px",
                background: "#14141B",
                border: `1px solid ${accent}55`,
                borderTop: `6px solid ${accent}`,
                borderRadius: 18,
                opacity: k,
                transform: `translateY(${(1 - k) * 50}px)`,
              }}
            >
              <div style={{ fontFamily: MONO, fontSize: 26, color: accent, fontWeight: 700 }}>0{i + 1}</div>
              <div style={{ fontSize: 40, fontWeight: 700, color: C.paper, marginTop: 12, lineHeight: 1.15 }}>{p}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const CTA: React.FC<Props> = ({ plan, repo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = plan.product.accent;
  const k = pop(frame, fps, 0, 14);
  return (
    <AbsoluteFill style={{ background: C.ink, fontFamily: SANS, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ fontSize: 170, fontWeight: 900, letterSpacing: -6, color: C.paper, transform: `scale(${0.85 + k * 0.15})`, opacity: k, lineHeight: 1 }}>
        {plan.product.name}
      </div>
      <div style={{ fontSize: 56, fontWeight: 700, color: accent, marginTop: 30, opacity: fadeIn(frame, 10) }}>{plan.product.cta}</div>
      <div
        style={{
          marginTop: 44,
          fontFamily: MONO,
          fontSize: 38,
          color: C.paper,
          border: `2px solid ${accent}`,
          borderRadius: 14,
          padding: "16px 36px",
          opacity: fadeIn(frame, 18),
          boxShadow: `0 0 50px ${accent}44`,
        }}
      >
        {plan.product.ctaDetail}
      </div>
      {repo.stars > 50 && (
        <div style={{ marginTop: 34, fontFamily: MONO, fontSize: 26, color: C.dim, opacity: fadeIn(frame, 26) }}>
          ★ {repo.stars.toLocaleString("en-US")} on GitHub · {repo.fullName}
        </div>
      )}
    </AbsoluteFill>
  );
};

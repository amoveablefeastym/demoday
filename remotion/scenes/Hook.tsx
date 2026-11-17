import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, SANS, fadeIn, pop } from "../lib.ts";
import type { Props } from "../lib.ts";

/** 0–3s: the pain, word by word, on black. No logo, no product name. */
export const Hook: React.FC<Props> = ({ plan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = plan.hook.line.split(/\s+/);
  const per = Math.min(5, Math.floor(40 / words.length));
  const doneAt = words.length * per + 6;
  const underline = interpolate(frame, [doneAt, doneAt + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const drift = interpolate(frame, [0, 96], [1, 1.06]);

  return (
    <AbsoluteFill style={{ background: C.ink, justifyContent: "center", alignItems: "center", fontFamily: SANS }}>
      <div style={{ transform: `scale(${drift})`, width: 1560, textAlign: "center" }}>
        <div style={{ fontSize: words.length > 6 ? 104 : 124, fontWeight: 900, color: C.paper, lineHeight: 1.04, letterSpacing: -3 }}>
          {words.map((w, i) => {
            const k = pop(frame, fps, i * per, 14);
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  marginRight: "0.24em",
                  opacity: k,
                  transform: `translateY(${(1 - k) * 40}px)`,
                  filter: `blur(${(1 - k) * 10}px)`,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
        <div style={{ margin: "26px auto 0", height: 10, width: `${underline * 62}%`, background: C.bad, borderRadius: 6 }} />
        <div style={{ marginTop: 34, fontSize: 40, fontWeight: 600, color: C.dim, opacity: fadeIn(frame, doneAt + 6, 12) }}>
          {plan.hook.sub}
        </div>
      </div>
    </AbsoluteFill>
  );
};

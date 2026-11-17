import { AbsoluteFill, Freeze, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, MONO, SANS, easeInOut, fmtClock, pop, theme } from "../lib.ts";
import type { Props } from "../lib.ts";
import type { Timeline } from "../../src/schema.ts";

type Key = { t: number; cx: number; cy: number; s: number };

/** Camera path: push in on each interaction, pull back for the payoff reveal. */
function cameraKeys(tl: Timeline): Key[] {
  const W = tl.width, H = tl.height;
  const home = { cx: W / 2, cy: H / 2, s: 1 };
  const keys: Key[] = [{ t: 0, ...home }];
  // Typing and key presses act on the last thing we aimed at, so the camera stays there.
  let last: Timeline["events"][number]["box"];
  const focus = tl.events
    .map((e) => {
      if (e.box) last = e.box;
      else if ((e.kind === "fill" || e.kind === "press") && last) return { ...e, box: last };
      return e;
    })
    .filter((e) => e.box);
  focus.forEach((e, i) => {
    const b = e.box!;
    let s = Math.min(W / (b.w * 2.4), H / (b.h * 3.4));
    s = Math.max(1.6, Math.min(e.kind === "fill" ? 2.1 : 1.95, s));
    if ((e.kind === "fill" || e.kind === "press") && b.h < 80) s = 2.0; // typing: get close to the text
    const half = { w: W / 2 / s, h: H / 2 / s };
    const typing = e.kind === "fill" || e.kind === "press";
    const fx = typing && b.w > half.w * 1.6 ? b.x + half.w * 0.8 : b.x + b.w / 2;
    const cx = Math.max(half.w, Math.min(W - half.w, fx));
    const cy = Math.max(half.h, Math.min(H - half.h, b.y + b.h / 2));
    const prev = keys.at(-1)!;
    const start = Math.max(prev.t + 0.05, e.t);
    keys.push({ ...prev, t: start });
    keys.push({ t: start + 0.55, cx, cy, s });
    const leave = e.emphasis ? Math.min(e.end, start + 1.0) : Math.max(start + 0.6, e.end - 0.1);
    keys.push({ t: leave, cx, cy, s });
    const next = focus[i + 1];
    if (e.emphasis || !next || next.t - leave > 1.4) keys.push({ t: leave + (e.emphasis ? 0.8 : 0.6), ...home });
  });
  return keys;
}

function at(keys: Key[], t: number): Key {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const k = easeInOut((t - a.t) / Math.max(1e-3, b.t - a.t));
      return { t, cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k, s: a.s + (b.s - a.s) * k };
    }
  }
  return keys.at(-1)!;
}

function cursorAt(tl: Timeline, t: number) {
  const c = tl.cursor;
  if (!c.length) return { x: tl.width / 2, y: tl.height / 2 };
  if (t <= c[0].t) return c[0];
  for (let i = 1; i < c.length; i++) {
    if (t <= c[i].t) {
      const k = easeInOut((t - c[i - 1].t) / Math.max(1e-3, c[i].t - c[i - 1].t));
      return { x: c[i - 1].x + (c[i].x - c[i - 1].x) * k, y: c[i - 1].y + (c[i].y - c[i - 1].y) * k };
    }
  }
  return c.at(-1)!;
}

const realTime = (tl: Timeline, t: number) => {
  const seg = tl.segments.find((s) => t >= s.t && t <= s.end) ?? tl.segments.at(-1)!;
  return Math.min(tl.realSeconds, seg.src + (Math.min(t, seg.end) - seg.t) * seg.rate);
};

/** Window geometry on the 1920x1080 canvas: a browser frame for web, the app's own window for native. */
/** The window sits above a caption band (CAPTION_BAND px at the bottom), so captions never cover the app. */
export const TOP = 112;
export const CAPTION_BAND = 136;
export function layout(tl: Timeline) {
  const bar = tl.chrome === "window" ? 0 : 44;
  const maxW = tl.chrome === "window" ? 1440 : 1376;
  const base = Math.min(maxW / tl.width, (1080 - TOP - CAPTION_BAND - bar) / tl.height);
  const w = Math.round(tl.width * base);
  return { x: Math.round((1920 - w) / 2), y: TOP, w, bar, base };
}

export const NewWay: React.FC<Props> = ({ plan, timeline: tl, video }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const accent = plan.product.accent;
  const th = theme(plan);
  const WIN = layout(tl);
  const base = WIN.base;
  const contentH = tl.height * base;

  const cam = at(cameraKeys(tl), t);
  const cur = cursorAt(tl, t);
  const clicks = tl.cursor.filter((c) => c.click && t >= c.t && t - c.t < 0.55);
  const pressed = tl.cursor.some((c) => c.click && t >= c.t && t - c.t < 0.12);

  const done = tl.events.filter((e) => e.t <= t && e.kind !== "goto" && e.kind !== "wait").length;
  const capIdx = tl.events.findLastIndex((e) => e.t <= t + 0.15 && e.caption);
  const cap = capIdx >= 0 ? tl.events[capIdx] : null;
  const capK = cap ? pop(frame, fps, Math.round(Math.max(0, cap.t - 0.15) * fps), 14) : 0;

  const ramp = tl.segments.find((s) => s.rate > 1 && t >= s.t && t < s.end);
  const aha = tl.events.find((e) => e.emphasis);
  const ahaT = aha ? aha.t + 0.75 : -99;
  const glow = interpolate(t, [ahaT, ahaT + 0.15, ahaT + 1.6], [0, 1, 0.25], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const enter = plan.launcher ? 1 : pop(frame, fps, 0, 16); // after a launcher beat the window is already open
  const oldTotal = plan.oldWay.steps.reduce((a, s) => a + s.seconds, 0);

  return (
    <AbsoluteFill
      style={
        th.soft
          ? { background: th.bg, backgroundImage: `radial-gradient(${th.line} 2px, transparent 2.5px)`, backgroundSize: "36px 36px", fontFamily: th.body }
          : { background: `radial-gradient(1400px 800px at 50% 110%, ${accent}40, ${C.ink} 65%)`, fontFamily: SANS }
      }
    >
      {th.soft ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 46, display: "flex", justifyContent: "center", opacity: enter }}>
          <div style={{ fontFamily: th.display, fontSize: 34, color: th.text, background: th.surface, padding: "8px 26px", borderRadius: 999, boxShadow: "0 6px 20px rgba(90,60,30,.08)" }}>
            {plan.product.name}
          </div>
        </div>
      ) : (<>
      {/* HUD left */}
      <div style={{ position: "absolute", left: WIN.x, top: 44, display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.ink, background: accent, padding: "7px 16px", borderRadius: 8, letterSpacing: 2 }}>
          THE NEW WAY
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, color: C.paper }}>{plan.product.name}</div>
      </div>

      {/* HUD right: the green clock next to the crossed-out red one */}
      <div style={{ position: "absolute", right: WIN.x, top: 30, display: "flex", alignItems: "flex-end", gap: 34, fontFamily: MONO }}>
        <div style={{ textAlign: "right", opacity: 0.75 }}>
          <div style={{ fontSize: 16, letterSpacing: 3, color: C.dim }}>OLD WAY</div>
          <div style={{ fontSize: 40, fontWeight: 700, color: C.bad, textDecoration: "line-through", textDecorationThickness: 4 }}>{fmtClock(oldTotal)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, letterSpacing: 3, color: C.dim }}>STEPS</div>
          <div style={{ fontSize: 56, fontWeight: 700, color: C.paper, lineHeight: 1 }}>{done}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, letterSpacing: 3, color: C.dim }}>TIME</div>
          <div style={{ fontSize: 56, fontWeight: 700, color: C.good, lineHeight: 1, textShadow: `0 0 30px ${C.good}66` }}>{fmtClock(realTime(tl, t))}</div>
        </div>
      </div>

      </>)}

      {/* Browser window */}
      <div
        style={{
          position: "absolute",
          left: WIN.x,
          top: WIN.y,
          width: WIN.w,
          height: WIN.bar + contentH,
          overflow: "hidden",
          background: WIN.bar ? "#fff" : "transparent",
          transform: `translateY(${(1 - enter) * 60}px) scale(${0.94 + enter * 0.06})`,
          opacity: enter,
          boxShadow: th.soft
            ? `0 30px 80px rgba(90,60,30,.16), 0 0 ${30 + glow * 90}px ${glow * 20}px ${accent}${Math.round(20 + glow * 110).toString(16).padStart(2, "0")}`
            : `0 40px 120px rgba(0,0,0,.6), 0 0 ${40 + glow * 120}px ${glow * 30}px ${accent}${Math.round(40 + glow * 140).toString(16).padStart(2, "0")}`,
          borderRadius: th.soft ? 22 : WIN.bar ? 16 : 14,
        }}
      >
        {WIN.bar > 0 && <div style={{ height: WIN.bar, background: "#EDEBE8", display: "flex", alignItems: "center", padding: "0 18px", gap: 9, borderBottom: "1px solid #dcd9d4" }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
          <div style={{ margin: "0 auto", fontFamily: MONO, fontSize: 17, color: "#555", background: "#fff", borderRadius: 8, padding: "5px 60px" }}>
            {plan.product.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </div>
        </div>}
        <div style={{ position: "relative", width: WIN.w, height: contentH, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              width: tl.width,
              height: tl.height,
              transformOrigin: "0 0",
              transform: `scale(${base}) translate(${tl.width / 2}px, ${tl.height / 2}px) scale(${cam.s}) translate(${-cam.cx}px, ${-cam.cy}px)`,
            }}
          >
            {tl.segments.map((g, i) => (
              <Sequence key={i} from={Math.round(g.t * fps)} durationInFrames={Math.max(1, Math.round((g.end - g.t) * fps))} layout="none">
                <OffthreadVideo
                  src={staticFile(video)}
                  muted
                  trimBefore={Math.round(g.rawSrc * fps)}
                  playbackRate={g.rate}
                  style={{ position: "absolute", width: tl.width, height: tl.height }}
                />
              </Sequence>
            ))}
            {/* hold the final frame through the tail of the scene */}
            <Sequence from={Math.round(tl.duration * fps)} layout="none">
              <Freeze frame={0}>
                <OffthreadVideo
                  src={staticFile(video)}
                  muted
                  trimBefore={Math.max(0, Math.round((tl.segments.at(-1)!.rawSrc + (tl.segments.at(-1)!.end - tl.segments.at(-1)!.t) * tl.segments.at(-1)!.rate) * fps) - 2)}
                  style={{ position: "absolute", width: tl.width, height: tl.height }}
                />
              </Freeze>
            </Sequence>
            {clicks.map((c, i) => {
              const k = (t - c.t) / 0.55;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: c.x - 34,
                    top: c.y - 34,
                    width: 68,
                    height: 68,
                    borderRadius: 34,
                    border: `${4 / cam.s}px solid ${accent}`,
                    transform: `scale(${0.3 + k * 1.2})`,
                    opacity: 1 - k,
                  }}
                />
              );
            })}
            <svg
              width={30}
              height={30}
              viewBox="0 0 24 24"
              style={{
                position: "absolute",
                left: cur.x - 4,
                top: cur.y - 3,
                transformOrigin: "4px 3px",
                transform: `scale(${(1.25 / cam.s) * (pressed ? 0.82 : 1)})`,
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))",
              }}
            >
              <path d="M4 3l15 8.5-6.6 1.6-2.9 6.4z" fill="#111" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
            </svg>
          </div>
          <AbsoluteFill style={{ background: "#fff", opacity: interpolate(t, [ahaT, ahaT + 0.05, ahaT + 0.3], [0, 0.35, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }} />
          {ramp && !th.soft && (
            <div style={{ position: "absolute", left: 22, top: 20, fontFamily: MONO, fontWeight: 700, fontSize: 24, color: "#fff", background: "rgba(0,0,0,.72)", padding: "6px 14px", borderRadius: 8 }}>
              ▶▶ {Math.round(ramp.rate)}×
            </div>
          )}
        </div>
      </div>

      {/* Caption */}
      {cap && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: CAPTION_BAND, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div
            key={capIdx}
            style={{
              transform: `translateY(${(1 - capK) * 30}px) scale(${0.9 + capK * 0.1})`,
              opacity: capK,
              ...(th.soft
                ? {
                    background: cap.emphasis ? accent : th.surface,
                    color: cap.emphasis ? th.surface : th.text,
                    fontFamily: th.display,
                    fontSize: cap.emphasis ? 64 : 54,
                    fontWeight: 500,
                    padding: "14px 40px",
                    borderRadius: 999,
                    boxShadow: "0 14px 40px rgba(90,60,30,.18)",
                  }
                : {
                    background: cap.emphasis ? accent : "rgba(10,10,14,.88)",
                    color: cap.emphasis ? C.ink : C.paper,
                    fontSize: cap.emphasis ? 72 : 60,
                    fontWeight: 800,
                    padding: "16px 38px",
                    borderRadius: 16,
                    letterSpacing: -0.5,
                    boxShadow: "0 20px 50px rgba(0,0,0,.45)",
                    borderLeft: cap.emphasis ? "none" : `8px solid ${accent}`,
                  }),
            }}
          >
            {cap.caption}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

import { AbsoluteFill, Freeze, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { easeInOut, fadeIn, pop, theme } from "../lib.ts";
import type { Props } from "../lib.ts";
import { CAPTION_BAND, layout } from "./NewWay.tsx";
import { Motif } from "./Soft.tsx";

/** Beat timings (frames into the scene); Sfx.tsx reads these too. */
export const LAUNCH = { cursorIn: 22, arrive: 52, click: 58, open: 62, opened: 94, cap2: 70 };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ICON = { x: 1772, y: 220 }; // icon centre, right of where the window will land

/** The app lives on the desktop: the icon is clicked and the real window grows out of it. */
export const Launcher: React.FC<Props> = ({ plan, timeline: tl, video }) => {
  const th = theme(plan);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = plan.launcher!;
  const WIN = layout(tl);
  const winH = WIN.bar + tl.height * WIN.base;

  // Cursor glides in from the lower middle and clicks the icon.
  const ck = easeInOut(interpolate(frame, [LAUNCH.cursorIn, LAUNCH.arrive], [0, 1], clamp));
  const cur = { x: 980 + (ICON.x - 6 - 980) * ck, y: 760 + (ICON.y + 4 - 760) * ck };
  const pressed = frame >= LAUNCH.click && frame < LAUNCH.click + 4;
  const ripple = interpolate(frame, [LAUNCH.click, LAUNCH.click + 18], [0, 1], clamp);
  const hover = interpolate(frame, [LAUNCH.arrive - 6, LAUNCH.arrive], [0, 1], clamp);

  // The window grows out of the icon to exactly where the walkthrough starts.
  const ok = pop(frame, fps, LAUNCH.open, 16);
  const s = 0.04 + 0.96 * ok;
  const wx = ICON.x + (WIN.x + WIN.w / 2 - ICON.x) * ok - (WIN.w * s) / 2;
  const wy = ICON.y + (WIN.y + winH / 2 - ICON.y) * ok - (winH * s) / 2;

  const cap = frame >= LAUNCH.cap2 && L.captions[1] ? L.captions[1] : L.captions[0];
  const capK = pop(frame, fps, cap === L.captions[0] ? 8 : LAUNCH.cap2, 14);
  const bob = Math.sin(frame / 11) * 5;
  const busy = interpolate(frame, [LAUNCH.open, LAUNCH.opened], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        background: th.soft ? `radial-gradient(1400px 900px at 70% 20%, #F6DCC4, ${th.bg} 70%)` : `radial-gradient(1400px 900px at 70% 20%, #2a1d14, ${th.bg} 70%)`,
        fontFamily: th.body,
        color: th.text,
      }}
    >
      {/* a plain menu bar */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 34, background: th.soft ? "rgba(255,251,244,.55)" : "rgba(255,255,255,.06)", backdropFilter: "blur(8px)" }} />

      {/* the everything-else you'd otherwise dig through */}
      {[
        { x: 170, y: 120, w: 760, h: 470, r: -1.5 },
        { x: 640, y: 300, w: 820, h: 520, r: 1 },
        { x: 260, y: 520, w: 640, h: 380, r: 0.5 },
      ].map((g, i) => (
        <div
          key={i}
          style={{
            position: "absolute", left: g.x, top: g.y, width: g.w, height: g.h, borderRadius: 18,
            background: th.soft ? "rgba(255,251,244,.7)" : "rgba(255,255,255,.05)",
            boxShadow: "0 20px 50px rgba(90,60,30,.10)",
            transform: `rotate(${g.r}deg)`,
            opacity: fadeIn(frame, i * 3, 12) * (1 - busy * 0.6),
            filter: `blur(${1.5 + busy * 4}px)`,
          }}
        >
          <div style={{ display: "flex", gap: 8, padding: 16 }}>
            {[0, 1, 2].map((d) => <div key={d} style={{ width: 12, height: 12, borderRadius: 6, background: th.line }} />)}
          </div>
          {[0.7, 0.5, 0.62].map((w, k) => <div key={k} style={{ margin: "14px 28px", height: 14, width: `${w * 100}%`, borderRadius: 7, background: th.line, opacity: 0.7 }} />)}
        </div>
      ))}

      {/* the desktop icon */}
      <div style={{ position: "absolute", left: ICON.x, top: ICON.y + bob, transform: `translate(-50%,-50%) scale(${1 + hover * 0.1 - (pressed ? 0.06 : 0)})`, opacity: fadeIn(frame, 4, 12) }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 150, height: 150, marginLeft: -75, marginTop: -75, borderRadius: 75, border: `3px solid ${th.accent}`, opacity: (1 - ripple) * (ripple > 0 ? 0.8 : 0), transform: `scale(${0.6 + ripple * 0.9})` }} />
        <div style={{ filter: `drop-shadow(0 6px ${10 + hover * 10}px rgba(242,140,40,${0.3 + hover * 0.35}))` }}>
          <Motif th={th} motif={plan.look?.motif} px={9} bake={1} steam frame={frame} />
        </div>
        {L.badge && (
          <div style={{ position: "absolute", right: -6, top: 26, fontFamily: th.display, fontSize: 26, lineHeight: 1, color: th.surface, background: th.accent, border: `3px solid ${th.text}`, padding: "2px 8px" }}>
            {L.badge}
          </div>
        )}
      </div>
      {L.hint && (
        <div style={{ position: "absolute", left: ICON.x, top: ICON.y + 115, transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: 26, fontWeight: 700, color: th.dim, opacity: fadeIn(frame, 30, 12) }}>
          {L.hint}
        </div>
      )}

      {/* the real app, opening out of the icon */}
      {frame >= LAUNCH.open && (
        <div
          style={{
            position: "absolute", left: wx, top: wy, width: WIN.w * s, height: winH * s,
            borderRadius: 22 * s, overflow: "hidden", opacity: Math.min(1, ok * 3),
            boxShadow: "0 30px 80px rgba(90,60,30,.18)",
          }}
        >
          <div style={{ width: WIN.w, height: winH, transform: `scale(${s})`, transformOrigin: "0 0" }}>
            <div style={{ width: tl.width, height: tl.height, transform: `scale(${WIN.base})`, transformOrigin: "0 0" }}>
              <Freeze frame={0}>
                <OffthreadVideo src={staticFile(video)} muted trimBefore={Math.round((tl.segments[0]?.rawSrc ?? 0) * fps)} style={{ width: tl.width, height: tl.height }} />
              </Freeze>
            </div>
          </div>
        </div>
      )}

      {/* cursor */}
      {frame >= LAUNCH.cursorIn - 4 && frame < LAUNCH.opened && (
        <svg width={34} height={44} viewBox="0 0 17 22"
          style={{ position: "absolute", left: cur.x, top: cur.y, opacity: fadeIn(frame, LAUNCH.cursorIn - 4, 6) * (1 - interpolate(frame, [LAUNCH.opened - 10, LAUNCH.opened], [0, 1], clamp)), transform: `scale(${pressed ? 0.85 : 1})`, filter: "drop-shadow(0 3px 4px rgba(0,0,0,.25))" }}>
          <path d="M1 1 L1 17 L5 13 L8 20 L11 19 L8 12 L14 12 Z" fill={th.soft ? th.text : "#fff"} stroke={th.soft ? th.surface : "#000"} strokeWidth={1.2} strokeLinejoin="round" />
        </svg>
      )}

      {/* caption, in the same band the walkthrough uses */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: CAPTION_BAND, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div
          key={cap}
          style={{
            opacity: capK, transform: `translateY(${(1 - capK) * 24}px)`,
            background: th.soft ? th.surface : "rgba(10,10,14,.88)", color: th.soft ? th.text : th.text,
            fontFamily: th.soft ? th.display : th.body, fontSize: 54, fontWeight: th.soft ? 500 : 800,
            padding: "14px 40px", borderRadius: 999, boxShadow: "0 14px 40px rgba(90,60,30,.18)",
          }}
        >
          {cap}
        </div>
      </div>
    </AbsoluteFill>
  );
};

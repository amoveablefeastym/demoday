import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeIn, fmtClock, fmtDuration, pop, rand, theme } from "../lib.ts";
import type { Props, Theme } from "../lib.ts";

/**
 * The "soft" look: light paper, one accent, few words, gentle motion.
 * Same scene lengths and beat timings as the bold scenes, so sound effects line up.
 */

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Light paper with a faint dot grid. */
export const Paper: React.FC<{ th: Theme; children?: React.ReactNode; center?: boolean }> = ({ th, children, center = true }) => (
  <AbsoluteFill
    style={{
      background: th.bg,
      backgroundImage: `radial-gradient(${th.line} 2px, transparent 2.5px)`,
      backgroundSize: "36px 36px",
      fontFamily: th.body,
      color: th.text,
      ...(center ? { justifyContent: "center", alignItems: "center", textAlign: "center" } : {}),
    }}
  >
    {children}
  </AbsoluteFill>
);

// The app's own loaf sprites (Half-Baked Sources/Theme.swift), stage by stage.
const OUT = "#4A2C17";
const DOUGH_P: Record<string, string> = { o: OUT, h: "#FFF8EA", d: "#F4E4C4", D: "#DCC398", b: "#8FB3CF", L: "#BBD5E8", n: "#6A8FAE" };
const SPRITES: { rows: string[]; pal: Record<string, string> }[] = [
  { pal: DOUGH_P, rows: ["....oooooo....", "..oohhdddDoo..", ".ohhddddddDDo.", "ohhdddddddddDo", "odddddddddddDo", "oDdddddddddDDo", ".oDDDDDDDDDDo.", "..oooooooooo.."] },
  { pal: DOUGH_P, rows: [".....oooooo.....", "...oohhdddDoo...", "..ohhddddddDDo..", "..ohddddddddDo..", "oooooooooooooooo", "oLbbbbbbbbbbbbno", ".oLbbbbbbbbbbno.", "..obbbbbbbbbno..", "...onnnnnnnno...", "....oooooooo...."] },
  { pal: { o: OUT, M: "#EBC98A", H: "#F8E6BC", S: "#C99A55" }, rows: [] },
  { pal: { o: OUT, M: "#C98238", H: "#F2C46D", S: "#8E4E1F" }, rows: [] },
];
const SHAPED = [".....oooooo.....", "...ooMMMMMMoo...", "..oMMHMMMHMMMo..", ".oMMHMMMHMMMHMo.", "oMMHMMMHMMMHMMSo", "oMMMMMMMMMMMMMSo", "oSMMMMMMMMMMMSSo", ".oSSSSSSSSSSSSo.", "..oooooooooooo.."];
SPRITES[2].rows = SHAPED;
SPRITES[3].rows = SHAPED;
const STEAM = [["....w......w....", ".....w......w...", "....w......w....", "................"], [".....w......w...", "....w......w....", ".....w......w...", "................"]];

/** The app's pixel loaf; `bake` 0..1 walks dough → rising → shaped → golden. Steam only when golden. */
export const Loaf: React.FC<{ px?: number; bake?: number; steam?: boolean; frame?: number }> = ({ px = 10, bake = 1, steam = false, frame = 0 }) => {
  const stage = bake < 0.25 ? 0 : bake < 0.5 ? 1 : bake < 0.8 ? 2 : 3;
  const { rows, pal } = SPRITES[stage];
  const W = 16, H = 4 + 10;
  const off = Math.floor((W - rows[0].length) / 2);
  const steamRows = STEAM[Math.floor(frame / 12) % 2];
  return (
    <svg width={W * px} height={H * px} viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" style={{ overflow: "visible" }}>
      {stage === 3 && steam &&
        steamRows.map((row, y) => [...row].map((ch, x) => (ch === "w" ? <rect key={`s${x}-${y}`} x={x} y={y} width={1} height={1} fill="rgba(59,36,22,.35)" /> : null)))}
      {rows.map((row, y) =>
        [...row].map((ch, x) => (pal[ch] ? <rect key={`${x}-${y}`} x={x + off} y={y + 4 + (10 - rows.length)} width={1.02} height={1.02} fill={pal[ch]} /> : null)),
      )}
    </svg>
  );
};

/** The product's little mascot: the pixel loaf if asked for, else a soft accent tile that fills in. */
export const Motif: React.FC<{ th: Theme; motif?: string; px?: number; bake?: number; steam?: boolean; frame?: number }> = ({ th, motif, px = 10, ...rest }) => {
  const bake = rest.bake ?? 1;
  if (th.motifImage)
    return (
      <Img
        src={staticFile(th.motifImage)}
        style={{ width: px * 16, height: px * 16, objectFit: "contain", filter: `saturate(${0.25 + 0.75 * bake}) brightness(${1.15 - 0.15 * bake})`, imageRendering: "pixelated" }}
      />
    );
  if ((motif ?? th.motif) === "loaf") return <Loaf px={px} {...rest} />;
  return <div style={{ width: px * 9, height: px * 9, borderRadius: px * 2.4, background: th.accent, opacity: 0.35 + 0.65 * bake, boxShadow: "0 10px 30px rgba(90,60,30,.12)" }} />;
};

/** Little 4-point sparkles that twinkle around a point. */
const Sparkles: React.FC<{ color: string; frame: number; at: number; spread?: number }> = ({ color, frame, at, spread = 260 }) => (
  <>
    {[0, 1, 2, 3].map((i) => {
      const k = interpolate(frame, [at + i * 5, at + i * 5 + 10, at + i * 5 + 34], [0, 1, 0], clamp);
      const a = rand(i + 3) * Math.PI * 2;
      const r = spread * (0.6 + rand(i + 11) * 0.4);
      return (
        <svg key={i} width={24} height={24} viewBox="0 0 5 5" shapeRendering="crispEdges"
          style={{ position: "absolute", left: `calc(50% + ${Math.cos(a) * r}px)`, top: `calc(50% + ${Math.sin(a) * r * 0.55}px)`, opacity: k, transform: `scale(${0.6 + k * 0.6})` }}>
          <rect x={2} y={0} width={1} height={5} fill={color} />
          <rect x={0} y={2} width={5} height={1} fill={color} />
        </svg>
      );
    })}
  </>
);

const bounce = (k: number, dist = 26) => `translateY(${(1 - k) * dist}px) scale(${0.96 + k * 0.04})`;

export const SoftHook: React.FC<Props> = ({ plan }) => {
  const th = theme(plan);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = plan.hook.line.split(/\s+/);
  const per = Math.min(5, Math.floor(40 / words.length));
  const doneAt = words.length * per + 6;
  return (
    <Paper th={th}>
      <div style={{ opacity: fadeIn(frame, 0, 12), transform: `translateY(${Math.sin(frame / 14) * 4}px)`, marginBottom: 56 }}>
        <Motif th={th} motif={plan.look?.motif} px={9} bake={0} />
      </div>
      <div style={{ fontFamily: th.display, fontSize: 92, fontWeight: 500, lineHeight: 1.15, maxWidth: 1400, letterSpacing: -0.5 }}>
        {words.map((w, i) => {
          const k = pop(frame, fps, i * per, 12);
          return <span key={i} style={{ display: "inline-block", marginRight: "0.26em", opacity: k, transform: bounce(k) }}>{w}</span>;
        })}
      </div>
      <div style={{ marginTop: 40, width: 120 * fadeIn(frame, doneAt, 14), height: 6, borderRadius: 3, background: th.accent }} />
    </Paper>
  );
};

/** The old way, quietly: a few paper slips pile up while a soft clock runs. */
export const SoftOldWay: React.FC<Props> = ({ plan }) => {
  const th = theme(plan);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { steps, verdict } = plan.oldWay;
  const STEP0 = 30, PER = 24;
  const verdictAt = durationInFrames - 60;
  const cum = steps.reduce<number[]>((a, s) => [...a, (a.at(-1) ?? 0) + s.seconds], []);
  let clock = 0;
  steps.forEach((_, i) => {
    const k = interpolate(frame, [STEP0 + i * PER, STEP0 + i * PER + 14], [0, 1], clamp);
    clock = k > 0 ? (i ? cum[i - 1] : 0) + k * steps[i].seconds : clock;
  });
  const settle = interpolate(frame, [verdictAt - 6, verdictAt + 10], [0, 1], clamp);
  const vk = pop(frame, fps, verdictAt, 14);

  return (
    <Paper th={th} center={false}>
      <div style={{ position: "absolute", left: 160, top: 120, fontFamily: th.display, fontSize: 34, color: th.dim, opacity: fadeIn(frame, 0, 10) }}>
        today
      </div>

      {/* Slips */}
      <div style={{ position: "absolute", left: 160, top: 210, opacity: 1 - settle * 0.75, filter: `blur(${settle * 3}px)` }}>
        {steps.map((s, i) => {
          const at = STEP0 + i * PER;
          if (frame < at) return null;
          const k = pop(frame, fps, at, 14);
          return (
            <div
              key={i}
              style={{
                width: 860,
                marginTop: i ? 22 : 0,
                marginLeft: rand(i + 7) * 60,
                padding: "26px 36px",
                background: th.surface,
                borderRadius: 22,
                boxShadow: "0 10px 30px rgba(90,60,30,.08)",
                fontSize: 42,
                fontWeight: 700,
                opacity: k,
                transform: `${bounce(k, 30)} rotate(${(rand(i) - 0.5) * 3}deg)`,
              }}
            >
              {s.text}
            </div>
          );
        })}
      </div>

      {/* Soft clock */}
      <div style={{ position: "absolute", right: 170, top: 300, textAlign: "right", opacity: fadeIn(frame, STEP0, 10) * (1 - settle * 0.75) }}>
        <div style={{ fontFamily: th.display, fontSize: 168, color: th.bad, lineHeight: 1 }}>{fmtClock(clock)}</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: th.dim, marginTop: 12 }}>per idea</div>
      </div>

      {/* Verdict */}
      {frame >= verdictAt && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ fontFamily: th.display, fontSize: 96, opacity: vk, transform: bounce(vk), textAlign: "center", maxWidth: 1500 }}>{verdict}</div>
        </AbsoluteFill>
      )}
    </Paper>
  );
};

export const SoftTurn: React.FC<Props> = ({ plan }) => {
  const th = theme(plan);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k1 = pop(frame, fps, 0, 14);
  const k2 = pop(frame, fps, 22, 11);
  return (
    <Paper th={th}>
      <div style={{ fontSize: 46, fontWeight: 700, color: th.dim, opacity: k1, transform: bounce(k1, 16) }}>{plan.turn}</div>
      <div style={{ marginTop: 50, transform: `scale(${0.6 + k2 * 0.4})`, opacity: k2 }}>
        <Motif th={th} motif={plan.look?.motif} px={12} bake={interpolate(frame, [26, 52], [0, 1], clamp)} steam frame={frame} />
      </div>
      <div style={{ fontFamily: th.display, fontSize: 130, fontWeight: 500, marginTop: 20, opacity: k2, transform: bounce(k2, 30) }}>{plan.product.name}</div>
      <Sparkles color={th.accent} frame={frame} at={30} spread={360} />
    </Paper>
  );
};

/** Before / after, as two quiet columns and one number. */
export const SoftCompare: React.FC<Props> = ({ plan, timeline }) => {
  const th = theme(plan);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const oldSec = plan.oldWay.steps.reduce((a, s) => a + s.seconds, 0);
  const newSec = Math.max(1, timeline.realSeconds);
  const heroAt = 30 + plan.compare.length * 14 + 16;
  const hero = pop(frame, fps, heroAt, 12);
  const colW = 640;
  return (
    <Paper th={th}>
      <div style={{ display: "flex", gap: 80, alignItems: "flex-start" }}>
        {(["old", "new"] as const).map((side) => (
          <div key={side} style={{ width: colW, textAlign: "left" }}>
            <div style={{ fontFamily: th.display, fontSize: 36, color: side === "old" ? th.dim : th.accent, marginBottom: 26, opacity: fadeIn(frame, 8) }}>
              {side === "old" ? "before" : "with " + plan.product.name}
            </div>
            {plan.compare.map((r, i) => {
              const a = 30 + i * 14;
              const k = pop(frame, fps, a, 14);
              const isNew = side === "new";
              return (
                <div
                  key={i}
                  style={{
                    padding: "24px 34px",
                    marginBottom: 18,
                    borderRadius: 22,
                    background: isNew ? th.surface : "transparent",
                    border: isNew ? "none" : `2px dashed ${th.line}`,
                    boxShadow: isNew ? "0 10px 30px rgba(90,60,30,.08)" : "none",
                    fontSize: 40,
                    fontWeight: isNew ? 800 : 700,
                    color: isNew ? th.text : th.dim,
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    opacity: k,
                    transform: bounce(k, 20),
                  }}
                >
                  {isNew && <span style={{ width: 14, height: 14, background: th.accent, flex: "none", transform: `scale(${pop(frame, fps, a + 10, 9)})` }} />}
                  {isNew ? r.new : r.old}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 60, display: "flex", alignItems: "baseline", gap: 30, fontFamily: th.display, opacity: hero, transform: bounce(hero) }}>
        <span style={{ fontSize: 64, color: th.dim, textDecoration: "line-through", textDecorationThickness: 4, textDecorationColor: th.bad }}>{fmtDuration(oldSec)}</span>
        <span style={{ fontSize: 56, color: th.dim }}>→</span>
        <span style={{ fontSize: 84, color: th.accent }}>{fmtDuration(newSec)}</span>
      </div>
    </Paper>
  );
};

export const SoftSpecial: React.FC<Props> = ({ plan }) => {
  const th = theme(plan);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = plan.special.headline.split(/\s+/);
  return (
    <Paper th={th}>
      <div style={{ fontFamily: th.display, fontSize: 84, fontWeight: 500, maxWidth: 1500, lineHeight: 1.15 }}>
        {words.map((w, i) => {
          const k = pop(frame, fps, i * 3, 13);
          return <span key={i} style={{ display: "inline-block", marginRight: "0.26em", opacity: k, transform: bounce(k), color: i === 0 && /^only$/i.test(w) ? th.accent : undefined }}>{w}</span>;
        })}
      </div>
      <div style={{ display: "flex", gap: 22, marginTop: 70 }}>
        {plan.special.points.map((p, i) => {
          const k = pop(frame, fps, 30 + i * 10, 13);
          return (
            <div key={i} style={{ padding: "20px 34px", borderRadius: 999, background: th.surface, boxShadow: "0 10px 30px rgba(90,60,30,.08)", fontSize: 34, fontWeight: 700, opacity: k, transform: bounce(k, 24) }}>
              {p}
            </div>
          );
        })}
      </div>
    </Paper>
  );
};

export const SoftCTA: React.FC<Props> = ({ plan }) => {
  const th = theme(plan);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = pop(frame, fps, 0, 12);
  return (
    <Paper th={th}>
      <div style={{ transform: `scale(${0.7 + k * 0.3}) translateY(${Math.sin(frame / 12) * 3}px)`, opacity: k }}>
        <Motif th={th} motif={plan.look?.motif} px={12} bake={1} steam frame={frame} />
      </div>
      <div style={{ fontFamily: th.display, fontSize: 140, fontWeight: 500, marginTop: 24, opacity: k, transform: bounce(k, 20) }}>{plan.product.name}</div>
      <div style={{ fontSize: 44, fontWeight: 700, color: th.accent, marginTop: 12, opacity: fadeIn(frame, 10) }}>{plan.product.cta}</div>
      <div style={{ marginTop: 40, fontSize: 30, fontWeight: 700, color: th.dim, padding: "14px 30px", borderRadius: 999, border: `2px solid ${th.line}`, opacity: fadeIn(frame, 18) }}>
        {plan.product.ctaDetail}
      </div>
      <Sparkles color={th.accent} frame={frame} at={6} spread={420} />
    </Paper>
  );
};

import { Easing, interpolate, spring } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/InterTight";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadPixelify } from "@remotion/google-fonts/PixelifySans";
import { loadFont as loadFredoka } from "@remotion/google-fonts/Fredoka";
import { loadFont as loadNunito } from "@remotion/google-fonts/Nunito";
import type { DemoPlan, Timeline } from "../src/schema.ts";

export const SANS = loadInter("normal", { weights: ["400", "600", "800", "900"], subsets: ["latin"] }).fontFamily;
export const MONO = loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily;
const PIXEL = loadPixelify("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] }).fontFamily;
const FREDOKA = loadFredoka("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;
const NUNITO = loadNunito("normal", { weights: ["500", "700", "800"], subsets: ["latin"] }).fontFamily;
const DISPLAY: Record<string, string> = { "Inter Tight": SANS, "Pixelify Sans": PIXEL, Fredoka: FREDOKA, Nunito: NUNITO };

/** Design tokens for the chosen look. Scenes read colors and fonts from here. */
export type Theme = {
  soft: boolean;
  bg: string; surface: string; text: string; dim: string; line: string;
  accent: string; bad: string; good: string;
  display: string; body: string;
  motif?: string; motifImage?: string;
};

/** Font family names for fonts shipped with the app (loaded in Video.tsx from look.fontFile / bodyFontFile). */
export const BRAND_DISPLAY = "BrandDisplay";
export const BRAND_BODY = "BrandBody";

/** Mix two #rrggbb colors; k=0 → a, k=1 → b. */
export const mix = (a: string, b: string, k: number) => {
  const h = (s: string, i: number) => parseInt(s.replace("#", "").slice(i * 2, i * 2 + 2), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(h(a, i) + (h(b, i) - h(a, i)) * k).toString(16).padStart(2, "0")).join("");
};
const hex = (s: string | undefined) => (s && /^#[0-9a-f]{6}$/i.test(s) ? s : undefined);
export function theme(plan: DemoPlan): Theme {
  const accent = plan.product.accent;
  const look = plan.look;
  const brand = {
    display: look?.fontFile ? `${BRAND_DISPLAY}, ${SANS}` : undefined,
    body: look?.bodyFontFile ? `${BRAND_BODY}, ${SANS}` : undefined,
    motif: look?.motif,
    motifImage: look?.motifImage,
  };
  if (look?.mood !== "soft") {
    return { soft: false, bg: C.ink, surface: C.ink2, text: C.paper, dim: C.dim, line: "#2a2a33", accent, bad: C.bad, good: C.good, display: brand.display ?? DISPLAY[look?.display ?? ""] ?? SANS, body: brand.body ?? SANS, motif: brand.motif, motifImage: brand.motifImage };
  }
  const bg = hex(look.paper) ?? "#F7F0E3";
  const text = hex(look.ink) ?? "#3D2A1E";
  return {
    soft: true,
    bg,
    surface: hex(look.surface) ?? mix(bg, "#FFFFFF", 0.6),
    text,
    dim: mix(text, bg, 0.55),
    line: mix(text, bg, 0.86),
    accent,
    bad: "#D98C7A",
    good: accent,
    display: brand.display ?? DISPLAY[look.display ?? ""] ?? FREDOKA,
    body: brand.body ?? NUNITO,
    motif: brand.motif,
    motifImage: brand.motifImage,
  };
}

export { FPS, TRANSITION, sceneFrames, sceneStarts } from "./timing.ts";


export const C = {
  ink: "#08080B",
  ink2: "#121218",
  paper: "#F4F2EE",
  dim: "#8A8A99",
  bad: "#FF4747",
  badDeep: "#3A0F12",
  good: "#3BE38B",
};

export type Props = {
  plan: DemoPlan;
  timeline: Timeline;
  repo: { fullName: string; stars: number };
  video: string;
  music?: string;
  /** Sound effects (typing, clicks, whooshes); files live in sfx/ next to the video. */
  sfx?: boolean;
};


export const pop = (frame: number, fps: number, delay = 0, damping = 13) =>
  spring({ frame: frame - delay, fps, config: { damping, stiffness: 170, mass: 0.7 } });

export const fadeIn = (frame: number, start: number, len = 10) =>
  interpolate(frame, [start, start + len], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

export const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export const fmtClock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export const fmtDuration = (s: number) => {
  if (s >= 3600) return `${(s / 3600).toFixed(1).replace(/\.0$/, "")} hr`;
  if (s >= 60) return `${Math.round(s / 60)} min`;
  return `${Math.round(s)} sec`;
};

/** Deterministic pseudo-random in [0,1) — Remotion renders must be pure functions of the frame. */
export const rand = (i: number) => {
  const x = Math.sin(i * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

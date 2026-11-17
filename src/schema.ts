import { z } from "zod";

/**
 * The storyboard. Every field maps to one beat of the video, and the
 * descriptions double as instructions to the model that writes it.
 *
 * Arc (from demo research): Hook -> Old way (pain, quantified) -> Turn ->
 * New way (real product, one killer workflow) -> Before/After -> Only-us -> CTA.
 */

export const Target = z
  .object({
    id: z.string().optional().describe("Accessibility identifier (macOS AXIdentifier, shown as id=… in the snapshot) or data-testid on the web. Most stable; prefer it when present."),
    role: z.string().optional().describe("ARIA role for page.getByRole, e.g. 'button', 'textbox', 'link' (also works for macOS apps)"),
    name: z.string().optional().describe("Accessible name used with role (exact text from the accessibility snapshot)"),
    text: z.string().optional().describe("Visible text for page.getByText when no good role exists"),
    label: z.string().optional().describe("Form label for page.getByLabel"),
    placeholder: z.string().optional().describe("Placeholder for page.getByPlaceholder"),
    css: z.string().optional().describe("Last-resort CSS selector"),
  })
  .describe("How to find the element. Prefer role+name, copied verbatim from the snapshot.");

export const Action = z.object({
  kind: z.enum(["goto", "click", "fill", "press", "hover", "scroll", "wait"]),
  target: Target.optional().describe("Required for click and hover. For fill, omit it to type into the already-focused field. Omit for goto/press/scroll/wait."),
  value: z
    .string()
    .optional()
    .describe("goto: URL. fill: text to type (realistic, specific data, never 'test'/'foo'). press: key like 'Enter' or 'Meta+K'. scroll: pixels. wait: ms."),
  caption: z
    .string()
    .describe("Burned-in caption, <= 6 words, states the OUTCOME not the UI ('Paste any messy JSON', not 'Click the editor'). Empty string for silent beats."),
  emphasis: z.boolean().describe("true on the single 'aha' action; the camera pushes in harder and holds longer"),
});

export const DemoPlan = z.object({
  product: z.object({
    name: z.string(),
    tagline: z.string().describe("<= 8 words, outcome-first"),
    url: z.string().describe("Live URL the recording starts at"),
    accent: z.string().describe("Brand accent hex color like #7C5CFF (from the site/README if visible)"),
    cta: z.string().describe("Final call to action, <= 6 words, low commitment ('Try it free — no signup')"),
    ctaDetail: z.string().describe("URL or install command shown under the CTA"),
  }),
  look: z
    .object({
      mood: z.enum(["bold", "soft"]).describe("bold: dark launch-video energy (default). soft: light, calm, minimal: for cozy/consumer/creative products"),
      display: z.enum(["Inter Tight", "Pixelify Sans", "Fredoka", "Nunito"]).optional().describe("Headline font; match the product's own type when it has one"),
      paper: z.string().optional().describe("soft: background hex (e.g. the app's own background)"),
      ink: z.string().optional().describe("soft: text hex"),
      surface: z.string().optional().describe("soft: card/pill hex (the app's card or panel color)"),
      fontFile: z.string().optional().describe("Path to the app's own display font file (ttf/otf/woff2), e.g. a font bundled in the repo. Beats `display`."),
      bodyFontFile: z.string().optional().describe("Path to the app's own body/UI font file"),
      motifImage: z.string().optional().describe("Path to an image of the app's mascot/icon (png/svg), e.g. its app icon. Used wherever the video shows the product's little mascot."),
      motif: z.enum(["loaf"]).optional().describe("soft: a small pixel mascot shown on the hook, turn and CTA. Only when it fits the product"),
    })
    .optional()
    .describe("Visual style of the video. Omit for bold."),
  launcher: z
    .object({
      captions: z.array(z.string()).min(1).max(2).describe("<= 5 words each, e.g. ['Lives on your desktop', 'One click. Jot anything.']"),
      hint: z.string().optional().describe("Small secondary way in, e.g. 'or ⌃⌥B from anywhere'"),
      badge: z.string().optional().describe("Tiny badge on the icon, e.g. a count"),
    })
    .optional()
    .describe("Only for apps that live as an always-there desktop/menu-bar icon: a beat before the walkthrough where the icon is clicked and the app opens out of it."),
  hook: z.object({
    line: z
      .string()
      .describe("First 3 seconds. <= 9 words. Names the PAIN or a bold outcome. Never the product name, never 'Introducing'/'Meet'."),
    sub: z.string().describe("<= 10 words that sharpen it, e.g. who suffers and how often"),
  }),
  oldWay: z.object({
    label: z
      .string()
      .describe("The concrete status quo the audience uses today, e.g. 'Draw.io + screenshots + a Confluence page'. Categories or real tools; only fair, true claims."),
    steps: z
      .array(
        z.object({
          text: z.string().describe("<= 7 words, a step the viewer has personally suffered through"),
          seconds: z.number().describe("Realistic time this step costs"),
          pain: z.enum(["slow", "error", "context-switch", "cost", "manual"]),
        }),
      )
      .min(3)
      .max(6),
    stats: z
      .array(z.object({ value: z.string().describe("e.g. '14 min', '23 clicks', '3 tools', '$49/mo'"), label: z.string() }))
      .min(2)
      .max(3)
      .describe("The quantified cost of the old way; these become the red counters"),
    verdict: z.string().describe("<= 6 words stamped over the chaos, e.g. 'And it's stale by Friday.'"),
  }),
  turn: z.string().describe("<= 6 words bridging to the product, e.g. 'Or: one paste.'"),
  newWay: z.object({
    task: z.string().describe("The SAME job the old way did, phrased as the outcome"),
    actions: z
      .array(Action)
      .min(3)
      .max(20)
      .describe("Start with a goto. One complete workflow ending on the payoff screen. No login, no settings tours."),
  }),
  compare: z
    .array(
      z.object({
        dimension: z.string().describe("e.g. 'Time', 'Clicks', 'Tools', 'Stays in sync'"),
        old: z.string(),
        new: z.string(),
      }),
    )
    .min(3)
    .max(4)
    .describe("Same dimensions as oldWay.stats where possible so the before/after is apples-to-apples"),
  special: z.object({
    headline: z
      .string()
      .describe("'Only <product> ...' — the unique mechanism that makes this possible, grounded in the README/code, <= 10 words"),
    points: z
      .array(z.string().describe("<= 7 words; a concrete mechanism or proof, not an adjective"))
      .length(3),
  }),
});

export type DemoPlan = z.infer<typeof DemoPlan>;
export type Action = z.infer<typeof Action>;
export type Target = z.infer<typeof Target>;

/** Written by the recorder, consumed by Remotion. Times are seconds in the FINAL (speed-ramped) clip. */
export type Timeline = {
  /** "browser" draws a browser frame with a URL bar; "window" shows a native app window as-is. */
  chrome: "browser" | "window";
  /** Recording file inside the out dir. */
  video: string;
  width: number;
  height: number;
  duration: number;
  /** Real wall-clock seconds the new-way workflow took (shown on the green counter). */
  realSeconds: number;
  actionsDone: number;
  events: Array<{
    t: number;
    end: number;
    kind: Action["kind"];
    caption: string;
    emphasis: boolean;
    box?: { x: number; y: number; w: number; h: number };
    /** Index of the plan action this event recorded (newWay.actions[index]). */
    index?: number;
    /** Real-time elapsed at this event, for the live counter. */
    realT: number;
  }>;
  cursor: Array<{ t: number; x: number; y: number; click?: boolean }>;
  /** Output-time segments; rate > 1 were fast-forwarded (shown with a ">> 4x" badge). src = real seconds since clip start, rawSrc = seconds into raw.webm. */
  segments: Array<{ t: number; end: number; src: number; rawSrc: number; rate: number }>;
};

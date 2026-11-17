import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewFrames } from "../remotion/timing.ts";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");

/** Render the MP4 plus one review still per beat (out/stills/*.jpg) for a quick visual check. */
export async function renderVideo(outDir: string, props: Record<string, any>, file = "demo.mp4") {
  const serveUrl = await bundle({ entryPoint: join(ROOT, "remotion/index.ts"), publicDir: outDir });
  const composition = await selectComposition({ serveUrl, id: "Demo", inputProps: props });
  const output = join(outDir, file);
  let last = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    crf: 17,
    inputProps: props,
    outputLocation: output,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct !== last) process.stdout.write(`  rendering ${(last = pct)}%\r`);
    },
  });
  process.stdout.write("\n");

  const stillsDir = join(outDir, "stills");
  mkdirSync(stillsDir, { recursive: true });
  for (const [name, frame] of Object.entries(reviewFrames(props as any))) {
    await renderStill({
      composition,
      serveUrl,
      inputProps: props,
      frame: Math.max(0, Math.min(composition.durationInFrames - 1, frame)),
      output: join(stillsDir, `${name}.jpg`),
      imageFormat: "jpeg",
      jpegQuality: 80,
      scale: 0.5,
    });
  }
  return { output, stillsDir, seconds: composition.durationInFrames / composition.fps };
}

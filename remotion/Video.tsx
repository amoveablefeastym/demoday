import { useEffect, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, interpolate, staticFile, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { C, TRANSITION, sceneFrames } from "./lib.ts";
import type { Props } from "./lib.ts";
import { Hook } from "./scenes/Hook.tsx";
import { OldWay } from "./scenes/OldWay.tsx";
import { NewWay } from "./scenes/NewWay.tsx";
import { CTA, Compare, Special, Turn } from "./scenes/Closers.tsx";
import { Sfx } from "./Sfx.tsx";
import { Launcher } from "./scenes/Launcher.tsx";
import { SoftCTA, SoftCompare, SoftHook, SoftOldWay, SoftSpecial, SoftTurn } from "./scenes/Soft.tsx";
import { BRAND_BODY, BRAND_DISPLAY, theme } from "./lib.ts";

export { totalFrames } from "./timing.ts";

/** Load fonts shipped with the app (look.fontFile / bodyFontFile, copied next to the video by the CLI). */
function useBrandFonts(props: Props) {
  const look = props.plan.look;
  const files = [
    [BRAND_DISPLAY, look?.fontFile],
    [BRAND_BODY, look?.bodyFontFile],
  ].filter((f): f is [string, string] => !!f[1]);
  const [handle] = useState(() => (files.length ? delayRender("brand fonts") : null));
  useEffect(() => {
    if (handle === null) return;
    Promise.all(files.map(([name, file]) => new FontFace(name, `url(${staticFile(file)})`).load().then((f) => document.fonts.add(f))))
      .catch((e) => console.error("brand font failed", e))
      .finally(() => continueRender(handle));
  }, [handle]);
}

export const DemoVideo: React.FC<Props> = (props) => {
  useBrandFonts(props);
  const f = sceneFrames(props);
  const soft = theme(props.plan).soft;
  const [H, O, T, Cm, S, CT] = soft ? [SoftHook, SoftOldWay, SoftTurn, SoftCompare, SoftSpecial, SoftCTA] : [Hook, OldWay, Turn, Compare, Special, CTA];
  const { durationInFrames } = useVideoConfig();
  const t = linearTiming({ durationInFrames: TRANSITION });
  const s = springTiming({ durationInFrames: TRANSITION, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ background: theme(props.plan).bg }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={f.hook}>
          <H {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={s} />
        <TransitionSeries.Sequence durationInFrames={f.oldWay}>
          <O {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={t} />
        <TransitionSeries.Sequence durationInFrames={f.turn}>
          <T {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={s} />
        {f.launcher > 0 && (
          <TransitionSeries.Sequence durationInFrames={f.launcher}>
            <Launcher {...props} />
          </TransitionSeries.Sequence>
        )}
        {f.launcher > 0 && <TransitionSeries.Transition presentation={fade()} timing={t} />}
        <TransitionSeries.Sequence durationInFrames={f.newWay}>
          <NewWay {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={s} />
        <TransitionSeries.Sequence durationInFrames={f.compare}>
          <Cm {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={t} />
        <TransitionSeries.Sequence durationInFrames={f.special}>
          <S {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={t} />
        <TransitionSeries.Sequence durationInFrames={f.cta}>
          <CT {...props} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      {props.sfx !== false && <Sfx {...props} />}
      {props.music && (
        <Audio
          src={staticFile(props.music)}
          volume={(fr) => interpolate(fr, [0, 20, durationInFrames - 45, durationInFrames], [0, props.sfx === false ? 0.6 : 0.4, props.sfx === false ? 0.6 : 0.4, 0], { extrapolateRight: "clamp" })}
        />
      )}
    </AbsoluteFill>
  );
};

import { Composition } from "remotion";
import { DemoVideo, totalFrames } from "./Video.tsx";
import { FPS } from "./lib.ts";
import type { Props } from "./lib.ts";
import sample from "./sample-props.json";

export const Root: React.FC = () => (
  <Composition
    id="Demo"
    component={DemoVideo}
    width={1920}
    height={1080}
    fps={FPS}
    durationInFrames={300}
    defaultProps={sample as unknown as Props}
    calculateMetadata={({ props }) => ({ durationInFrames: totalFrames(props) })}
  />
);

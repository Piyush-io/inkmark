import type { CalculateMetadataFunction } from "remotion";
import { Composition } from "remotion";
import {
  DURATION,
  FPS,
  HEIGHT,
  InkmarkIntro,
  WIDTH,
  waitForFonts,
} from "./Composition";

const calculateMetadata: CalculateMetadataFunction<Record<string, unknown>> =
  async () => {
    await waitForFonts();
    return {};
  };

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="InkmarkIntro"
      component={InkmarkIntro}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      calculateMetadata={calculateMetadata}
    />
  );
};

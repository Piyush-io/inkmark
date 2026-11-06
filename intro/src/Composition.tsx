import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, Sequence } from "remotion";
import { Backdrop } from "@/components/remocn/backdrop";
import { MicroScaleFade } from "@/components/remocn/micro-scale-fade";
import { StaggeredFadeUp } from "@/components/remocn/staggered-fade-up";
import { HighlightMark, NoteMark, THEME, Wordmark, type Mode } from "./inkmark-ui";

const geist = loadGeist("normal", {
  subsets: ["latin"],
  weights: ["400", "500"],
});
const geistMono = loadGeistMono("normal", {
  subsets: ["latin"],
  weights: ["400"],
});

export const GREY = "#8A8A86";
export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;
export const FADE = 16;
export const BOARD_H = 56;
export const BOARD_N = 66;
export const BOARD_E = 48;
export const DURATION = BOARD_H + BOARD_N + BOARD_E - FADE - FADE;

const COLUMN: React.CSSProperties = {
  position: "absolute",
  left: 200,
  top: 168,
  width: 720,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 22,
};

const fontVars = {
  "--font-geist-sans": geist.fontFamily,
  "--font-geist-mono": geistMono.fontFamily,
} as React.CSSProperties;

const Board: React.FC<{
  mode: Mode;
  line?: string;
  caption?: string;
  children?: React.ReactNode;
}> = ({ mode, line, caption, children }) => {
  const theme = THEME[mode];
  return (
    <Backdrop fill={{ type: "color", value: theme.paper }} padding={0} radius={0} shadow="">
      <AbsoluteFill style={fontVars}>
        <div style={COLUMN}>
          {line ? (
            <StaggeredFadeUp
              text={line}
              fontSize={20}
              fontWeight={400}
              color={theme.ink}
              staggerDelay={1}
              distance={4}
              speed={1.6}
            />
          ) : null}
          {children}
          {caption ? (
            <Sequence from={16} layout="none">
              <MicroScaleFade
                text={caption}
                fontSize={13}
                fontWeight={400}
                color={GREY}
                scaleFrom={0.98}
                speed={1.8}
              />
            </Sequence>
          ) : null}
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
};

export const InkmarkIntro: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={BOARD_H}>
        <Board mode="light" line="I mark a line on a page." caption="option+s.">
          <HighlightMark />
        </Board>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        timing={linearTiming({ durationInFrames: FADE })}
        presentation={fade()}
      />
      <TransitionSeries.Sequence durationInFrames={BOARD_N}>
        <Board mode="dark" line="I write a note on the mark." caption="saved.">
          <NoteMark />
        </Board>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        timing={linearTiming({ durationInFrames: FADE })}
        presentation={fade()}
      />
      <TransitionSeries.Sequence durationInFrames={BOARD_E}>
        <Board mode="dark">
          <Wordmark />
        </Board>
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};

export const waitForFonts = () =>
  Promise.all([geist.waitUntilDone(), geistMono.waitUntilDone()]);

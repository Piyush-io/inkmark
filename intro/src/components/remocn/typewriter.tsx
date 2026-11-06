"use client";

import { Caret } from "@/components/remocn/caret";
import { useTypewriter } from "@/lib/remocn-ui";

export interface TypewriterProps {
  text: string;
  cursor?: boolean;
  charsPerSecond?: number;
  speed?: number;
  fontSize?: number;
  color?: string;
  cursorColor?: string;
  fontWeight?: number;
  className?: string;
  fontFamily?: string;
  startFrame?: number;
  lineHeight?: number;
}

export function Typewriter({
  text,
  cursor = true,
  charsPerSecond = 22,
  speed = 1,
  fontSize = 48,
  color = "#171717",
  cursorColor = "#171717",
  fontWeight = 600,
  className,
  fontFamily = "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace",
  startFrame = 0,
  lineHeight,
}: TypewriterProps) {
  const tw = useTypewriter(text, { cps: charsPerSecond, speed, startFrame });

  return (
    <div style={{ position: "relative", display: "block" }}>
      <span
        className={className}
        style={{
          fontSize,
          fontWeight,
          color,
          fontFamily,
          whiteSpace: "pre",
          lineHeight: lineHeight ? `${lineHeight}px` : undefined,
        }}
      >
        {tw.text}
        {cursor && (
          <Caret
            color={cursorColor}
            blink={!tw.typing}
            speed={speed}
            radius={0}
            style={{
              width: "0.08em",
              height: "1em",
              marginLeft: "0.04em",
              verticalAlign: "text-bottom",
            }}
          />
        )}
      </span>
    </div>
  );
}

"use client";

import { interpolate, useCurrentFrame } from "remotion";

export interface StaggeredFadeUpProps {
  text: string;
  staggerDelay?: number;
  distance?: number;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  speed?: number;
  className?: string;
}

export function StaggeredFadeUp({
  text,
  staggerDelay = 4,
  distance = 20,
  fontSize = 72,
  color = "#171717",
  fontWeight = 600,
  speed = 1,
  className,
}: StaggeredFadeUpProps) {
  const frame = useCurrentFrame() * speed;

  const words = text.split(" ");

  return (
    <div style={{ position: "relative", display: "block" }}>
      <span
        className={className}
        style={{
          fontSize,
          fontWeight,
          color,
          fontFamily:
            "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {words.map((word, i) => {
          const local = frame - i * staggerDelay;
          const opacity = interpolate(local, [0, 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const y = interpolate(local, [0, 12], [distance, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: i === words.length - 1 ? 0 : "0.25em",
                opacity,
                translate: `0 ${y}px`,
              }}
            >
              {word}
            </span>
          );
        })}
      </span>
    </div>
  );
}

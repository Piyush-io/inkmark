import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const COLORS = [
  { id: "yellow", swatch: "#F5C931", bg: "rgba(250, 210, 50, 0.42)" },
  { id: "mint", swatch: "#4CC38A", bg: "rgba(76, 195, 138, 0.34)" },
  { id: "sky", swatch: "#5A9CF2", bg: "rgba(90, 156, 242, 0.32)" },
  { id: "rose", swatch: "#EC6F9D", bg: "rgba(236, 111, 157, 0.30)" },
  { id: "peach", swatch: "#F2954B", bg: "rgba(242, 149, 75, 0.36)" },
  { id: "lilac", swatch: "#A483F0", bg: "rgba(164, 131, 240, 0.34)" },
] as const;

const NOTE = "keep this.";
const snap = Easing.bezier(0.2, 0.8, 0.2, 1);

export type Mode = "light" | "dark";

export const THEME = {
  light: {
    paper: "#F4F4F3",
    ink: "#171717",
    text: "#1E1D1A",
    surface: "#FFFFFF",
    sunken: "#F3F1EC",
    line: "#E8E5DE",
    lineStrong: "#D8D4CB",
    muted: "#6F6B63",
    faint: "#9A958B",
    bar: "#1E1D1A",
    barText: "#F4F2EE",
    barLine: "rgba(255,255,255,0.12)",
    shadow: "0 1px 2px rgba(30,29,26,.06), 0 18px 48px -8px rgba(30,29,26,.22)",
  },
  dark: {
    paper: "#111111",
    ink: "#E8E8E4",
    text: "#EEECE7",
    surface: "#232220",
    sunken: "#151413",
    line: "#302E2A",
    lineStrong: "#403D38",
    muted: "#A8A399",
    faint: "#7C776E",
    bar: "#2A2926",
    barText: "#F4F2EE",
    barLine: "rgba(255,255,255,0.10)",
    shadow: "0 0 0 1px rgba(255,255,255,.06), 0 18px 48px -8px rgba(0,0,0,.6)",
  },
} as const;

const pop = (frame: number, fps: number, delay: number) =>
  spring({
    fps,
    frame: Math.max(0, frame - delay),
    config: { damping: 16, stiffness: 340, mass: 0.45 },
  });

const Stroke: React.FC<{ d: string[]; size?: number }> = ({ d, size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {d.map((p) => (
      <path key={p} d={p} />
    ))}
  </svg>
);

const NoteIcon = () => <Stroke d={["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"]} />;
const CopyIcon = () => (
  <Stroke
    d={["M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z", "M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"]}
    size={15}
  />
);
const TrashIcon = () => (
  <Stroke
    d={["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12", "M9 7V4h6v3"]}
    size={15}
  />
);

const Toolbar: React.FC<{
  theme: (typeof THEME)[Mode];
  pressed?: string;
  noteDown?: boolean;
}> = ({ theme, pressed = "yellow", noteDown }) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: 4,
        background: theme.bar,
        color: theme.barText,
        borderRadius: 12,
        width: "fit-content",
      }}
    >
      {COLORS.map((c) => (
        <div
          key={c.id}
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: pressed === c.id ? theme.barLine : "transparent",
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: c.swatch,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
              transform: pressed === c.id ? "scale(1.12)" : "scale(1)",
            }}
          />
        </div>
      ))}
      <div style={{ width: 1, height: 18, background: theme.barLine, margin: "0 4px" }} />
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 28,
          padding: "0 9px 0 7px",
          borderRadius: 8,
          fontSize: 12.5,
          fontWeight: 550,
          fontFamily: "var(--font-geist-sans), ui-sans-serif, sans-serif",
          background: noteDown ? theme.barLine : "transparent",
          transform: noteDown ? "scale(0.97)" : "scale(1)",
        }}
      >
        <NoteIcon />
        Note
      </div>
    </div>
  );
};

const Quote: React.FC<{ theme: (typeof THEME)[Mode]; paint: number }> = ({ theme, paint }) => (
  <p
    style={{
      margin: 0,
      fontFamily: "Iowan Old Style, Charter, Georgia, serif",
      fontSize: 20,
      lineHeight: 1.55,
      color: theme.text,
    }}
  >
    A highlight is a line you might want again.
    <br />
    <span
      style={{
        backgroundImage: `linear-gradient(${COLORS[0].bg}, ${COLORS[0].bg})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${paint * 100}% 100%`,
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      }}
    >
      I mark it here.
    </span>
  </p>
);

const NotePopover: React.FC<{
  theme: (typeof THEME)[Mode];
  typed: string;
  saved?: boolean;
}> = ({ theme, typed, saved }) => {
  const frame = useCurrentFrame();
  const blink = Math.floor(frame / 8) % 2 === 0;

  return (
    <div
      style={{
        width: 300,
        background: theme.surface,
        color: theme.text,
        border: `1px solid ${theme.line}`,
        borderRadius: 14,
        boxShadow: theme.shadow,
        fontFamily: "var(--font-geist-sans), ui-sans-serif, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "8px 8px 6px 10px" }}>
        {COLORS.map((c) => (
          <div
            key={c.id}
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              boxShadow: c.id === "yellow" ? `0 0 0 2px ${theme.surface}, 0 0 0 3.5px ${theme.text}` : "none",
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: c.swatch,
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
              }}
            />
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ width: 30, height: 30, display: "grid", placeItems: "center", color: theme.muted }}>
          <CopyIcon />
        </div>
        <div style={{ width: 30, height: 30, display: "grid", placeItems: "center", color: theme.muted }}>
          <TrashIcon />
        </div>
      </div>
      <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            minHeight: 76,
            border: `1px solid ${theme.lineStrong}`,
            borderRadius: 10,
            background: theme.surface,
            fontSize: 13.5,
            lineHeight: 1.45,
            padding: "8px 10px",
            color: typed ? theme.text : theme.faint,
          }}
        >
          {typed || "Add a note…"}
          <span
            style={{
              display: "inline-block",
              width: 1.5,
              height: "1em",
              marginLeft: 1,
              background: blink ? theme.text : "transparent",
              verticalAlign: "text-bottom",
            }}
          />
        </div>
        <div
          style={{
            minHeight: 36,
            border: `1px solid ${theme.line}`,
            borderRadius: 10,
            background: theme.sunken,
            fontSize: 13,
            color: theme.faint,
            padding: "8px 10px",
          }}
        >
          Add tag
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11.5,
            color: theme.faint,
            padding: "0 2px",
          }}
        >
          <span>Enter adds a tag</span>
          <span>{saved ? "Saved" : ""}</span>
        </div>
      </div>
    </div>
  );
};

export const HighlightMark: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = THEME.light;
  const enter = pop(frame, fps, 2);
  const press = interpolate(frame, [8, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: snap,
  });
  const paint = interpolate(frame, [12, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: snap,
  });

  return (
    <div
      style={{
        opacity: enter,
        transform: `translateY(${(1 - enter) * 10}px)`,
      }}
    >
      <div
        style={{
          opacity: interpolate(frame, [4, 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: snap,
          }),
          transform: `scale(${interpolate(frame, [4, 12], [0.96, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: snap,
          })})`,
          transformOrigin: "12px 20px",
          marginBottom: 14,
        }}
      >
        <Toolbar theme={theme} pressed={press > 0.5 ? "yellow" : undefined} />
      </div>
      <Quote theme={theme} paint={paint} />
    </div>
  );
};

export const NoteMark: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = THEME.dark;
  const enter = pop(frame, fps, 0);
  const noteDown = interpolate(frame, [8, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: snap,
  });
  const popover = pop(frame, fps, 14);
  const typedCount = interpolate(frame, [24, 24 + NOTE.length], [0, NOTE.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const typed = NOTE.slice(0, Math.round(typedCount));
  const saved = frame > 24 + NOTE.length + 4;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 20,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 8}px)`,
      }}
    >
      <div style={{ width: 300, paddingTop: 4 }}>
        <div style={{ marginBottom: 14 }}>
          <Toolbar theme={theme} pressed="yellow" noteDown={noteDown > 0.4} />
        </div>
        <Quote theme={theme} paint={1} />
      </div>
      <div
        style={{
          opacity: popover,
          transform: `translateY(${(1 - popover) * 8}px) scale(${0.98 + popover * 0.02})`,
          transformOrigin: "left top",
        }}
      >
        <NotePopover theme={theme} typed={typed} saved={saved} />
      </div>
    </div>
  );
};

export const Wordmark: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = pop(frame, fps, 2);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 8}px)`,
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          background: "#F5C931",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 4,
            right: 4,
            bottom: 4,
            height: 2,
            borderRadius: 2,
            background: "#1E1D1A",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "var(--font-geist-sans), ui-sans-serif, sans-serif",
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color: "#E8E8E4",
        }}
      >
        Inkmark
      </span>
    </div>
  );
};

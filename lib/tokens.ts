// Forensic-ledger palette (DESIGN.md §3). Verdict colors are reserved for
// verdict / divergence semantics only — never decorative.
export const c = {
  ink: "#0F1A2A",
  inkSoft: "#1C2A3D",
  paper: "#F4F5F2",
  surface: "#FFFFFF",
  rule: "#D9D9D2",
  muted: "#5B6470",
  verified: "#167C5B",
  divergent: "#B3261E",
  amber: "#B26B00",
  instrument: "#1F5F7A",

  // extended tones used across the comp
  raised: "#FAFAF8", // raised table/card headers
  divider: "#ECECE6", // light row dividers
  divider2: "#F1F1EB",
  muted2: "#9AA1AB", // faintest text
  dashBorder: "#C9CABF", // dashed upload borders
  accentLt: "#6FB0CC", // logo glyph on ink
  sealMuted: "#8A94A3", // labels inside the ink seal
  sealText: "#C7CDD6", // body text inside the ink seal
  sealRule: "#28374B", // hairline inside the ink seal
  verifiedLt: "#2FA277", // verdict word on ink (lighter for contrast)
  divergentLt: "#DD5A50",
  track: "#E4E4DD", // chart axes / progress track
} as const;

export const font = {
  sans: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
  serif: "'Spectral', serif",
} as const;

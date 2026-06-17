import Link from "next/link";
import { c, font } from "@/lib/tokens";

// Top app bar — shared across every screen (the comp's fixed 56px ink header).
export default function Chrome() {
  return (
    <div
      style={{
        height: 56,
        flex: "none",
        background: c.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        borderBottom: `1px solid ${c.inkSoft}`,
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
        <div
          style={{
            width: 27,
            height: 27,
            borderRadius: 5,
            background: c.inkSoft,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: font.mono,
            color: c.accentLt,
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          =
        </div>
        <span style={{ fontWeight: 600, fontSize: 15.5, color: c.paper, letterSpacing: ".2px" }}>
          Parity
        </span>
      </Link>
      <span
        style={{
          fontFamily: font.sans,
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: ".13em",
          textTransform: "uppercase",
          color: c.muted,
        }}
      >
        Independent verification
      </span>
    </div>
  );
}

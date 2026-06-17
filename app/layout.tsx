import type { Metadata } from "next";
import "./globals.css";
import Chrome from "./components/Chrome";
import { c } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Parity — Independent verification",
  description:
    "An independent verification layer for AI-generated legacy-code migrations. Compares legacy and migrated programs field by field and issues a verdict you can sign.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Spectral:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            background: c.paper,
          }}
        >
          <Chrome />
          <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
        </div>
      </body>
    </html>
  );
}

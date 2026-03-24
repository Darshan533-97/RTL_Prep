import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RTL Interview Prep — CPU Design",
  description: "Level-by-level RTL and CPU design interview preparation. Based on real open-source CPU implementations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header style={{ borderBottom: "1px solid var(--border)", padding: "1rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>RTL Prep</span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginLeft: "0.75rem" }}>CPU Design Interview Track</span>
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            Based on CVA6 · PicoRV32 · VexRiscv · RISC-V ISA
          </div>
        </header>
        <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.5rem" }}>
          {children}
        </main>
      </body>
    </html>
  );
}

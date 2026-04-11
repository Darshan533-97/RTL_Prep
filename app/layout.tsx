import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RTL Prep — Learn CPU Design with CVA6",
  description:
    "A structured step-by-step course for learning CPU microarchitecture and SystemVerilog design through the CVA6 open-source core.",
};

const nav = [
  { href: "/", label: "Course Home" },
  { href: "/learn", label: "Curriculum" },
  { href: "/hierarchy", label: "Module Map" },
  { href: "/mock", label: "Mock Interview" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            borderBottom: "1px solid var(--border)",
            position: "sticky",
            top: 0,
            zIndex: 20,
            backdropFilter: "blur(10px)",
            background: "rgba(10,10,10,0.92)",
          }}
        >
          <div
            style={{
              maxWidth: "1180px",
              margin: "0 auto",
              padding: "1rem 1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <Link href="/" style={{ textDecoration: "none" }}>
                <span style={{ color: "var(--accent)", fontWeight: 800, fontSize: "1.15rem", letterSpacing: "-0.03em" }}>
                  RTL Prep
                </span>
              </Link>
              <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "0.2rem" }}>
                Professor-style CPU design course built around CVA6 and real SystemVerilog
              </div>
            </div>

            <nav style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap", alignItems: "center" }}>
              {nav.map((item) => (
                <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
                  <span className="nav-pill">{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main style={{ maxWidth: "1180px", margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>{children}</main>
      </body>
    </html>
  );
}

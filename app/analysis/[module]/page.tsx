"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getAnalysisByModule } from "@/lib/file_analysis";
import { getFileByModule } from "@/lib/hierarchy";

export default function AnalysisPage() {
  const params = useParams();
  const mod = params.module as string;
  const analysis = getAnalysisByModule(mod);
  const meta = getFileByModule(mod);

  if (!analysis) {
    return (
      <div>
        <Link href="/hierarchy"><button className="btn-ghost">← Back to Hierarchy</button></Link>
        <p style={{ marginTop: "1rem", color: "var(--text-muted)" }}>No detailed analysis available for <code>{mod}</code> yet.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "900px" }}>
      {/* Nav */}
      <div style={{ marginBottom: "1.5rem", display: "flex", gap: "1rem", alignItems: "center" }}>
        <Link href="/hierarchy" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.88rem" }}>← Hierarchy</Link>
        <span style={{ color: "var(--border)" }}>|</span>
        <Link href="/learn" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.88rem" }}>Lessons</Link>
      </div>

      {/* Header */}
      <div className="card" style={{ marginBottom: "2rem", borderColor: "var(--accent)" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap" }}>
          <code style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--accent)" }}>{analysis.module}</code>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace", background: "var(--surface2)", padding: "0.15rem 0.5rem", borderRadius: "3px", border: "1px solid var(--border)" }}>
            {analysis.path}
          </span>
        </div>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.65 }}>{analysis.overview}</p>

        {/* Hierarchy quick-view */}
        {meta && (
          <div style={{ marginTop: "0.85rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.68rem", color: "#aaaaff", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>← Parent</div>
              {meta.instantiatedBy.map((p, i) => <code key={i} style={{ fontSize: "0.75rem", color: "#aaaaff", display: "block" }}>{p}</code>)}
            </div>
            {meta.instantiates.length > 0 && (
              <div>
                <div style={{ fontSize: "0.68rem", color: "#00ff88", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>→ Children</div>
                {meta.instantiates.map((c, i) => <code key={i} style={{ fontSize: "0.75rem", color: "#00ff88", display: "block" }}>{c}</code>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Internal Logic */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.85rem" }}>⚙️ Internal Logic</div>
        {analysis.internalLogic.split("\n\n").map((para, i) => {
          const t = para.trim();
          if (!t) return null;
          if (/^[A-Z][A-Z0-9\s\-:\/()]+$/.test(t) && t.length < 80) return (
            <div key={i} style={{ margin: "1.2rem 0 0.35rem 0", fontSize: "0.77rem", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.07em", borderLeft: "3px solid var(--accent)", paddingLeft: "0.55rem" }}>{t}</div>
          );
          const rendered = t.replace(/`([^`]+)`/g, (_, c) =>
            `<code style="background:var(--surface2);padding:0.05rem 0.3rem;border-radius:3px;font-family:monospace;font-size:0.83em;color:var(--accent)">${c}</code>`
          );
          return <p key={i} style={{ margin: "0 0 0.75rem 0", lineHeight: 1.8, color: "var(--text)", fontSize: "0.9rem" }} dangerouslySetInnerHTML={{ __html: rendered }} />;
        })}
      </div>

      {/* State Machines */}
      {analysis.stateMachines.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "0.78rem", color: "#ffdd00", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.85rem" }}>🔄 State Machines</div>
          {analysis.stateMachines.map((sm, i) => (
            <div key={i} className="card" style={{ marginBottom: "1rem", borderColor: "#2a2a0d" }}>
              <div style={{ fontWeight: 700, color: "#ffdd00", marginBottom: "0.5rem" }}>{sm.name}</div>
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>{sm.description}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.5rem" }}>
                {sm.states.map((s, j) => (
                  <span key={j} style={{ fontFamily: "monospace", fontSize: "0.75rem", background: "var(--surface2)", border: "1px solid #ffdd00", borderRadius: "3px", padding: "0.1rem 0.4rem", color: "#ffdd00" }}>{s}</span>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.7 }}>{sm.transitions}</p>
            </div>
          ))}
        </div>
      )}

      {/* Always Blocks */}
      {analysis.alwaysBlocks.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.85rem" }}>📋 Key always Blocks</div>
          {analysis.alwaysBlocks.map((blk, i) => (
            <div key={i} style={{ marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.1rem 0.4rem", borderRadius: "3px", background: blk.type === "comb" ? "#0d2a3a" : "#0d2a1a", color: blk.type === "comb" ? "#00aaff" : "#00ff88", border: `1px solid ${blk.type === "comb" ? "#00aaff" : "#00ff88"}`, textTransform: "uppercase" }}>
                  {blk.type === "comb" ? "always_comb" : "always_ff"}
                </span>
                <code style={{ fontSize: "0.82rem", color: "var(--text)", fontWeight: 600 }}>{blk.label}</code>
              </div>
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>{blk.purpose}</p>
              <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px", overflow: "hidden" }}>
                <pre style={{ margin: 0, padding: "1rem", fontSize: "0.78rem", lineHeight: 1.75, color: "#c9d1d9", overflowX: "auto", fontFamily: "'Geist Mono', monospace" }}>
                  <code>{blk.code}</code>
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Key Design Points */}
      <div className="card" style={{ marginBottom: "2rem", borderColor: "#2a1a3a" }}>
        <div style={{ fontSize: "0.78rem", color: "#cc88ff", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>🏗️ Key Design Points</div>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {analysis.keyDesignPoints.map((d, i) => (
            <li key={i} style={{ color: "var(--text)", lineHeight: 1.75, fontSize: "0.88rem" }}>{d}</li>
          ))}
        </ul>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
        <Link href="/hierarchy"><button className="btn-ghost">← All Modules</button></Link>
        <Link href="/learn"><button className="btn-ghost">📚 Lessons</button></Link>
      </div>
    </div>
  );
}

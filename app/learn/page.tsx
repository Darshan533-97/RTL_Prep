"use client";
import Link from "next/link";
import { getLessonsByStage } from "@/lib/lessons";

const DIFF_COLOR: Record<string, { color: string; bg: string; label: string }> = {
  beginner:     { color: "#00ff88", bg: "#0d2a1a", label: "Beginner" },
  intermediate: { color: "#ffdd00", bg: "#2a2a0d", label: "Intermediate" },
  advanced:     { color: "#ff6644", bg: "#2a1a0d", label: "Advanced" },
};

const STAGE_LABELS: Record<number, string> = {
  1: "Frontend → Fetch",
  2: "Decode → ID Stage",
  3: "Issue → Scoreboard",
  4: "Execute → EX Stage",
  5: "Commit → Writeback",
};

export default function LearnPage() {
  const lessons = getLessonsByStage();

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.9rem" }}>← Back</Link>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 800, margin: "0.75rem 0 0.5rem", letterSpacing: "-0.03em" }}>
          📚 CVA6 RISC-V CPU — Stage by Stage
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: "0 0 0.5rem 0", lineHeight: 1.6 }}>
          Walk through a real out-of-order RISC-V processor (CVA6 by ETH Zurich) from frontend to commit.
          Each lesson explains the actual RTL — real module ports, real signals, real design decisions.
        </p>
        <Link href="/hierarchy">
          <button className="btn-ghost" style={{ marginTop: "0.5rem", fontSize: "0.82rem" }}>
            🗂️ View Full Source Hierarchy →
          </button>
        </Link>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          {[1,2,3,4,5].map(s => (
            <span key={s} style={{ fontSize: "0.78rem", color: "var(--text-muted)", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "4px", padding: "0.2rem 0.6rem" }}>
              Stage {s}: {STAGE_LABELS[s]}
            </span>
          ))}
        </div>
      </div>

      {/* Pipeline flow diagram */}
      <div className="card" style={{ marginBottom: "2rem", padding: "1rem 1.25rem" }}>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>CVA6 Pipeline Flow</div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", flexWrap: "wrap", fontSize: "0.82rem" }}>
          {["Frontend\n(Fetch + BPred)", "Decode\n(ID Stage)", "Issue\n(Scoreboard)", "Execute\n(ALU/LSU/BU)", "Commit\n(Writeback)"].map((stage, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <div style={{ padding: "0.4rem 0.7rem", background: "var(--surface2)", border: "1px solid var(--accent)", borderRadius: "4px", textAlign: "center", lineHeight: 1.4, color: "var(--accent)", fontWeight: 600, whiteSpace: "pre-line", fontSize: "0.75rem" }}>
                {stage}
              </div>
              {i < 4 && <span style={{ color: "var(--text-muted)" }}>→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Lesson cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {lessons.map((lesson) => {
          const diff = DIFF_COLOR[lesson.difficulty];
          return (
            <Link key={lesson.id} href={`/learn/${lesson.id}`} style={{ textDecoration: "none" }}>
              <div className="card" style={{ cursor: "pointer", display: "flex", gap: "1.25rem", alignItems: "flex-start" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                {/* Stage number */}
                <div style={{ flexShrink: 0, width: "2.5rem", height: "2.5rem", borderRadius: "50%", background: "var(--surface2)", border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "var(--accent)", fontSize: "1rem" }}>
                  {lesson.stage}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.4rem", alignItems: "center" }}>
                    <span style={{ background: diff.bg, color: diff.color, border: `1px solid ${diff.color}`, borderRadius: "4px", padding: "0.1rem 0.45rem", fontSize: "0.7rem", fontWeight: 700 }}>
                      {diff.label}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>{lesson.subtitle}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginLeft: "auto" }}>{lesson.duration}</span>
                  </div>
                  <h3 style={{ margin: "0 0 0.35rem 0", fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>{lesson.title}</h3>
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.55 }}>{lesson.summary}</p>
                  <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--accent)" }}>
                    {lesson.keySignals.length} key signals · {lesson.snippets.length} code snippet{lesson.snippets.length !== 1 ? "s" : ""} · {lesson.relatedQuestions.length} practice Qs →
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

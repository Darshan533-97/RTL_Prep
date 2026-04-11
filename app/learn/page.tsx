"use client";

import Link from "next/link";
import { courseUnits } from "@/lib/course";
import { getLessonsByStage } from "@/lib/lessons";

const DIFF_COLOR: Record<string, { color: string; bg: string; label: string }> = {
  beginner: { color: "#00ff88", bg: "#0d2a1a", label: "Beginner" },
  intermediate: { color: "#ffdd00", bg: "#2a2a0d", label: "Intermediate" },
  advanced: { color: "#ff6644", bg: "#2a1a0d", label: "Advanced" },
};

export default function LearnPage() {
  const lessons = getLessonsByStage();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section className="hero-card" style={{ padding: "1.7rem" }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.9rem" }}>
          ← Back home
        </Link>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: "0.8rem 0 0.6rem", letterSpacing: "-0.04em" }}>
          The CVA6 curriculum, sequenced like a real course
        </h1>
        <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "0.96rem", lineHeight: 1.7, maxWidth: "860px" }}>
          Don&apos;t read the repo like a random file dump. Read it like a machine being assembled in front of you. Each unit below introduces the architectural purpose, the critical modules, and the SystemVerilog techniques that make the implementation work.
        </p>
      </section>

      <section className="card">
        <div style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
          Recommended reading order
        </div>
        <div style={{ display: "grid", gap: "1rem" }}>
          {courseUnits.map((unit) => {
            const unitLessons = lessons.filter((lesson) => unit.lessonIds.includes(lesson.id));
            return (
              <div key={unit.id} style={{ border: "1px solid var(--border)", borderRadius: "14px", padding: "1rem", background: "var(--surface)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(240px, 0.8fr)", gap: "1rem" }}>
                  <div>
                    <div style={{ display: "flex", gap: "0.55rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                      <span style={{ color: "var(--accent)", fontWeight: 800, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Unit {unit.order}
                      </span>
                      <span className="tag">{unit.moduleExamples.join(" · ")}</span>
                    </div>
                    <h2 style={{ margin: "0 0 0.45rem", fontSize: "1.12rem", letterSpacing: "-0.02em" }}>{unit.title}</h2>
                    <p style={{ margin: "0 0 0.7rem", color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.65 }}>{unit.description}</p>
                    <div style={{ color: "var(--blue)", fontSize: "0.83rem", lineHeight: 1.6, marginBottom: "0.75rem" }}>
                      <strong>Design question:</strong> {unit.designQuestion}
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      {unit.systemVerilogFocus.map((focus) => (
                        <span key={focus} className="tag">SV: {focus}</span>
                      ))}
                    </div>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "0.9rem", background: "var(--surface2)" }}>
                    <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: "0.5rem" }}>
                      Read these next
                    </div>
                    {unitLessons.length === 0 ? (
                      <div style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: 1.65 }}>
                        Use the hierarchy explorer for this unit. This is where you study package files, debug logic, and the supporting infrastructure around the main datapath.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "0.55rem" }}>
                        {unitLessons.map((lesson) => {
                          const diff = DIFF_COLOR[lesson.difficulty];
                          return (
                            <Link key={lesson.id} href={`/learn/${lesson.id}`} style={{ textDecoration: "none" }}>
                              <div style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "0.7rem", background: "#11161a" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
                                  <span style={{ background: diff.bg, color: diff.color, border: `1px solid ${diff.color}`, borderRadius: "999px", padding: "0.08rem 0.45rem", fontSize: "0.68rem", fontWeight: 700 }}>
                                    {diff.label}
                                  </span>
                                  <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{lesson.duration}</span>
                                </div>
                                <div style={{ fontWeight: 700, fontSize: "0.9rem", lineHeight: 1.45 }}>{lesson.title}</div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid-auto">
        <div className="card">
          <div style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.6rem" }}>
            How to study this site
          </div>
          <ol style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--text)", lineHeight: 1.8, fontSize: "0.9rem" }}>
            <li>Read a unit overview first so you know why the module exists.</li>
            <li>Open the lesson and trace the important structs and handshakes.</li>
            <li>Ask how you would build the same mechanism from scratch in SV.</li>
            <li>Then jump to interview questions to see whether the mental model stuck.</li>
          </ol>
        </div>

        <div className="card">
          <div style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.6rem" }}>
            Supporting tools
          </div>
          <div style={{ display: "grid", gap: "0.6rem" }}>
            <Link href="/hierarchy" style={{ textDecoration: "none", color: "var(--accent)" }}>→ Explore module hierarchy and deep analyses</Link>
            <Link href="/mock" style={{ textDecoration: "none", color: "var(--accent)" }}>→ Run a mock CPU design interview</Link>
            <Link href="/practice/1" style={{ textDecoration: "none", color: "var(--accent)" }}>→ Start with foundational practice questions</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

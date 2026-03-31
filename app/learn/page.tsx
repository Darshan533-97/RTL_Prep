"use client";
import Link from "next/link";
import { lessons, getLessonsByCategory } from "@/lib/lessons";

const DIFF_COLOR: Record<string, { color: string; bg: string; label: string }> = {
  beginner:     { color: "#00ff88", bg: "#0d2a1a", label: "Beginner" },
  intermediate: { color: "#ffdd00", bg: "#2a2a0d", label: "Intermediate" },
  advanced:     { color: "#ff6644", bg: "#2a1a0d", label: "Advanced" },
};

export default function LearnPage() {
  const byCategory = getLessonsByCategory();

  return (
    <div>
      <div style={{ marginBottom: "2.5rem" }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.9rem" }}>← Back</Link>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 800, margin: "0.75rem 0 0.5rem", letterSpacing: "-0.03em" }}>
          📚 CPU Architecture Deep Dive
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", margin: 0 }}>
          {lessons.length} lessons written by a veteran CPU architect. Real RTL code. Real tradeoffs. No fluff.
        </p>
      </div>

      {Object.entries(byCategory).map(([category, catLessons]) => (
        <div key={category} style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 1rem 0", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
            {category}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
            {catLessons.map((lesson) => {
              const diff = DIFF_COLOR[lesson.difficulty];
              return (
                <Link key={lesson.id} href={`/learn/${lesson.id}`} style={{ textDecoration: "none" }}>
                  <div className="card" style={{ cursor: "pointer", height: "100%", transition: "border-color 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.6rem" }}>
                      <span style={{
                        background: diff.bg, color: diff.color, border: `1px solid ${diff.color}`,
                        borderRadius: "4px", padding: "0.15rem 0.5rem", fontSize: "0.7rem", fontWeight: 700
                      }}>{diff.label}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{lesson.duration}</span>
                    </div>
                    <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.4 }}>
                      {lesson.title}
                    </h3>
                    <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
                      {lesson.summary}
                    </p>
                    <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--accent)" }}>
                      {lesson.snippets.length} code snippet{lesson.snippets.length !== 1 ? "s" : ""} · {lesson.relatedQuestions.length} practice question{lesson.relatedQuestions.length !== 1 ? "s" : ""} →
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

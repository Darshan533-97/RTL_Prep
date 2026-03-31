"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getLessonById } from "@/lib/lessons";
import { questions } from "@/lib/questions";

const DIFF_COLOR: Record<string, { color: string; bg: string }> = {
  beginner:     { color: "#00ff88", bg: "#0d2a1a" },
  intermediate: { color: "#ffdd00", bg: "#2a2a0d" },
  advanced:     { color: "#ff6644", bg: "#2a1a0d" },
};

export default function LessonPage() {
  const params = useParams();
  const lesson = getLessonById(params.id as string);

  if (!lesson) {
    return (
      <div>
        <p>Lesson not found.</p>
        <Link href="/learn"><button className="btn-ghost">← Back to Lessons</button></Link>
      </div>
    );
  }

  const diff = DIFF_COLOR[lesson.difficulty];
  const paragraphs = lesson.body.split("\n\n");
  const relatedQs = questions.filter(q => lesson.relatedQuestions.includes(q.id));

  return (
    <div style={{ maxWidth: "900px" }}>
      {/* Back */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/learn" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.9rem" }}>
          ← Back to Pipeline Overview
        </Link>
      </div>

      {/* Header */}
      <div className="card" style={{ marginBottom: "2rem", borderColor: "var(--accent)" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem", alignItems: "center" }}>
          <span style={{ background: "var(--surface2)", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: "50%", width: "2rem", height: "2rem", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.9rem", flexShrink: 0 }}>
            {lesson.stage}
          </span>
          <span style={{ background: diff.bg, color: diff.color, border: `1px solid ${diff.color}`, borderRadius: "4px", padding: "0.15rem 0.5rem", fontSize: "0.75rem", fontWeight: 700, textTransform: "capitalize" }}>
            {lesson.difficulty}
          </span>
          <span style={{ background: "var(--surface2)", color: "var(--text-muted)", borderRadius: "4px", padding: "0.15rem 0.5rem", fontSize: "0.72rem", border: "1px solid var(--border)", fontFamily: "monospace" }}>
            {lesson.subtitle}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "auto" }}>{lesson.duration}</span>
        </div>
        <h1 style={{ margin: "0 0 0.6rem 0", fontSize: "1.45rem", fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.02em" }}>
          {lesson.title}
        </h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.65, fontStyle: "italic" }}>
          {lesson.summary}
        </p>
      </div>

      {/* Body */}
      <div style={{ marginBottom: "2rem" }}>
        {paragraphs.map((para, i) => {
          if (!para.trim()) return null;
          // Detect section headers like "WHAT THE FRONTEND DOES:"
          if (/^[A-Z][A-Z\s\-\/()]+:/.test(para.trim()) && para.trim().length < 80) {
            return (
              <div key={i} style={{ margin: "1.5rem 0 0.5rem 0", fontSize: "0.8rem", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em", borderLeft: "3px solid var(--accent)", paddingLeft: "0.6rem" }}>
                {para.trim()}
              </div>
            );
          }
          // Detect numbered items starting with a digit
          if (/^\d+\./.test(para.trim())) {
            return (
              <p key={i} style={{ margin: "0 0 0.75rem 0.5rem", lineHeight: 1.75, color: "var(--text)", fontSize: "0.92rem" }}>
                {para.trim()}
              </p>
            );
          }
          // Detect "  — item" bullets
          if (para.trim().startsWith("—")) {
            return (
              <p key={i} style={{ margin: "0 0 0.4rem 1.2rem", lineHeight: 1.7, color: "var(--text-muted)", fontSize: "0.88rem" }}>
                {para.trim()}
              </p>
            );
          }
          const rendered = para.replace(/`([^`]+)`/g, (_, code) =>
            `<code style="background:var(--surface2);padding:0.1rem 0.35rem;border-radius:3px;font-family:monospace;font-size:0.83em;color:var(--accent)">${code}</code>`
          );
          return (
            <p key={i} style={{ margin: "0 0 1rem 0", lineHeight: 1.8, color: "var(--text)", fontSize: "0.93rem" }}
              dangerouslySetInnerHTML={{ __html: rendered }} />
          );
        })}
      </div>

      {/* Code Snippets */}
      {lesson.snippets.map((snippet, i) => (
        <div key={i} style={{ marginBottom: "2rem" }}>
          <div style={{ background: "#0d1117", border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ padding: "0.5rem 1rem", borderBottom: "1px solid #30363d", display: "flex", alignItems: "center", gap: "0.5rem", background: "#161b22" }}>
              <span style={{ color: "#00ff88", fontSize: "0.8rem" }}>⬡</span>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#c9d1d9" }}>{snippet.label}</span>
            </div>
            {snippet.annotation && (
              <div style={{ padding: "0.5rem 1rem", background: "#1c2128", borderBottom: "1px solid #30363d", fontSize: "0.78rem", color: "#8b949e", fontStyle: "italic" }}>
                💬 {snippet.annotation}
              </div>
            )}
            <pre style={{ margin: 0, padding: "1.25rem 1rem", overflowX: "auto", fontFamily: "'Geist Mono', 'Fira Code', monospace", fontSize: "0.8rem", lineHeight: 1.75, color: "#c9d1d9", background: "#0d1117" }}>
              <code>{snippet.code}</code>
            </pre>
          </div>
        </div>
      ))}

      {/* Key Signals */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1rem" }}>
          🔌 Key Signals Explained
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {lesson.keySignals.map((sig, i) => (
            <div key={i} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <div style={{ flexShrink: 0, display: "flex", gap: "0.35rem", alignItems: "center", minWidth: "180px" }}>
                <span style={{
                  fontSize: "0.65rem", fontWeight: 700, padding: "0.1rem 0.35rem", borderRadius: "3px",
                  background: sig.direction === "input" ? "#0d2a3a" : "#0d2a1a",
                  color: sig.direction === "input" ? "#00aaff" : "#00ff88",
                  border: `1px solid ${sig.direction === "input" ? "#00aaff" : "#00ff88"}`,
                  textTransform: "uppercase"
                }}>{sig.direction}</span>
                <code style={{ fontSize: "0.78rem", color: "var(--accent)", fontFamily: "monospace" }}>{sig.name}</code>
              </div>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.6 }}>{sig.explanation}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Design Decisions */}
      <div className="card" style={{ marginBottom: "2rem", borderColor: "#2a2a3a" }}>
        <div style={{ fontSize: "0.78rem", color: "#aaaaff", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
          🏗️ Design Decisions & Why
        </div>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {lesson.designDecisions.map((d, i) => (
            <li key={i} style={{ color: "var(--text)", lineHeight: 1.7, fontSize: "0.88rem" }}>{d}</li>
          ))}
        </ul>
      </div>

      {/* Related Questions */}
      {relatedQs.length > 0 && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
            🎯 Practice These Concepts
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {relatedQs.map((q) => {
              const qIdx = questions.filter(x => x.level === q.level).findIndex(x => x.id === q.id);
              return (
                <Link key={q.id} href={`/practice/${q.level}?q=${qIdx}`} style={{ textDecoration: "none" }}>
                  <div style={{ padding: "0.55rem 0.85rem", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                    <div>
                      <span style={{ fontSize: "0.72rem", color: "var(--accent)", fontWeight: 600, marginRight: "0.5rem" }}>L{q.level} · {q.topic}</span>
                      <span style={{ fontSize: "0.8rem", color: "var(--text)" }}>{q.question.slice(0, 85)}…</span>
                    </div>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "0.5rem", flexShrink: 0 }}>→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        <Link href="/learn"><button className="btn-ghost">← Pipeline Overview</button></Link>
        <Link href="/"><button className="btn-ghost">🏠 Home</button></Link>
      </div>
    </div>
  );
}

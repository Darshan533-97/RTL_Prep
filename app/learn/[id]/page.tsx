"use client";
import { useParams, useRouter } from "next/navigation";
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
  const router = useRouter();
  const lesson = getLessonById(params.id as string);

  if (!lesson) {
    return (
      <div style={{ padding: "2rem" }}>
        <p>Lesson not found.</p>
        <button className="btn-ghost" onClick={() => router.push("/learn")}>← Back to Lessons</button>
      </div>
    );
  }

  const diff = DIFF_COLOR[lesson.difficulty];
  const paragraphs = lesson.body.split("\n\n");
  const relatedQs = questions.filter(q => lesson.relatedQuestions.includes(q.id));

  return (
    <div style={{ maxWidth: "860px" }}>
      {/* Back */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/learn" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.9rem" }}>
          ← Back to Lessons
        </Link>
      </div>

      {/* Header */}
      <div className="card" style={{ marginBottom: "2rem", borderColor: "var(--accent)" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem", alignItems: "center" }}>
          <span style={{
            background: diff.bg, color: diff.color, border: `1px solid ${diff.color}`,
            borderRadius: "4px", padding: "0.15rem 0.5rem", fontSize: "0.75rem", fontWeight: 700, textTransform: "capitalize"
          }}>{lesson.difficulty}</span>
          <span style={{ background: "var(--surface2)", color: "var(--text-muted)", borderRadius: "4px", padding: "0.15rem 0.5rem", fontSize: "0.75rem", border: "1px solid var(--border)" }}>
            {lesson.category}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "auto" }}>{lesson.duration}</span>
        </div>
        <h1 style={{ margin: "0 0 0.75rem 0", fontSize: "1.5rem", fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.02em" }}>
          {lesson.title}
        </h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6, fontStyle: "italic" }}>
          {lesson.summary}
        </p>
      </div>

      {/* Body */}
      <div style={{ marginBottom: "2rem" }}>
        {paragraphs.map((para, i) => {
          // Detect bold headers like **text**
          if (para.startsWith("**") && para.includes(":**")) {
            const [header, ...rest] = para.split(":**");
            return (
              <div key={i} style={{ marginBottom: "1rem" }}>
                <span style={{ fontWeight: 700, color: "var(--accent)" }}>{header.replace(/\*\*/g, "")}:</span>
                <span style={{ color: "var(--text)", lineHeight: 1.75 }}>{rest.join(":**")}</span>
              </div>
            );
          }
          // Code-like inline (backtick)
          const rendered = para.replace(/`([^`]+)`/g, (_, code) =>
            `<code style="background:var(--surface2);padding:0.1rem 0.3rem;border-radius:3px;font-family:monospace;font-size:0.85em;color:var(--accent)">${code}</code>`
          );
          return (
            <p key={i} style={{ margin: "0 0 1rem 0", lineHeight: 1.75, color: "var(--text)", fontSize: "0.95rem" }}
              dangerouslySetInnerHTML={{ __html: rendered }} />
          );
        })}
      </div>

      {/* Key Insights */}
      <div className="card" style={{ marginBottom: "2rem", borderColor: "#2a4a2a" }}>
        <div style={{ fontSize: "0.8rem", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
          💡 Key Insights
        </div>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {lesson.keyInsights.map((insight, i) => (
            <li key={i} style={{ color: "var(--text)", lineHeight: 1.65, fontSize: "0.9rem" }}>{insight}</li>
          ))}
        </ul>
      </div>

      {/* Code Snippets */}
      {lesson.snippets.map((snippet, i) => (
        <div key={i} style={{ marginBottom: "2rem" }}>
          <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "var(--accent)", fontSize: "0.85rem" }}>⬡</span>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>{snippet.label}</span>
            </div>
            <pre style={{
              margin: 0, padding: "1.25rem", overflowX: "auto",
              fontFamily: "'Geist Mono', 'Fira Code', monospace", fontSize: "0.82rem",
              lineHeight: 1.7, color: "#c9d1d9", background: "#0d1117"
            }}>
              <code>{snippet.code}</code>
            </pre>
          </div>
        </div>
      ))}

      {/* Related Practice Questions */}
      {relatedQs.length > 0 && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            🎯 Practice These Concepts
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {relatedQs.map((q) => (
              <Link key={q.id} href={`/practice/${q.level}?q=${questions.filter(x => x.level === q.level).findIndex(x => x.id === q.id)}`}
                style={{ textDecoration: "none" }}>
                <div style={{
                  padding: "0.6rem 0.9rem", background: "var(--surface2)", border: "1px solid var(--border)",
                  borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center",
                  cursor: "pointer"
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 600, marginRight: "0.5rem" }}>
                      Level {q.level} · {q.topic}
                    </span>
                    <span style={{ fontSize: "0.82rem", color: "var(--text)" }}>{q.question.slice(0, 80)}…</span>
                  </div>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "0.5rem" }}>→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        <Link href="/learn"><button className="btn-ghost">← All Lessons</button></Link>
        <Link href="/"><button className="btn-ghost">🏠 Home</button></Link>
      </div>
    </div>
  );
}

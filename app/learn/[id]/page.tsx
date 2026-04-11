"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { getLessonById } from "@/lib/lessons";
import { questions } from "@/lib/questions";
import { courseUnits, getUnitForLesson } from "@/lib/course";

const DIFF_COLOR: Record<string, { color: string; bg: string }> = {
  beginner: { color: "#00ff88", bg: "#0d2a1a" },
  intermediate: { color: "#ffdd00", bg: "#2a2a0d" },
  advanced: { color: "#ff6644", bg: "#2a1a0d" },
};

function buildSvTakeaways(lesson: NonNullable<ReturnType<typeof getLessonById>>) {
  const text = `${lesson.summary} ${lesson.body}`.toLowerCase();
  const takeaways: string[] = [];

  if (text.includes("valid/ready") || text.includes("ready/valid")) {
    takeaways.push("Use explicit valid/ready handshakes to decouple stages and make backpressure visible in the RTL.");
  }
  if (text.includes("packed struct") || text.includes("struct")) {
    takeaways.push("Group related control and data fields into packed structs so stage interfaces stay readable as the core grows.");
  }
  if (text.includes("scoreboard") || text.includes("trans_id")) {
    takeaways.push("Tag in-flight work with a transaction ID so writeback can update the correct state without associative searching.");
  }
  if (text.includes("flush") || text.includes("mispredict")) {
    takeaways.push("Design flush paths early: every speculative structure needs a clearly defined kill or cancel behavior.");
  }
  if (text.includes("store buffer") || text.includes("commit")) {
    takeaways.push("Separate speculative execution from architectural commitment; buffers are often what make that separation practical.");
  }
  if (text.includes("decoder") || text.includes("opcode")) {
    takeaways.push("Keep decode mostly combinational and table-driven so instruction meaning is easy to audit and extend.");
  }

  return takeaways.slice(0, 4);
}

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
  const relatedQs = questions.filter((q) => lesson.relatedQuestions.includes(q.id));
  const unit = getUnitForLesson(lesson.id) || courseUnits.find((candidate) => candidate.order === lesson.stage);
  const svTakeaways = buildSvTakeaways(lesson);

  return (
    <div style={{ maxWidth: "980px", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <Link href="/learn" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.9rem" }}>
          ← Back to curriculum
        </Link>
      </div>

      <section className="hero-card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.85rem", alignItems: "center" }}>
          <span style={{ background: "var(--surface2)", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: "999px", padding: "0.18rem 0.55rem", fontSize: "0.74rem", fontWeight: 800 }}>
            Stage {lesson.stage}
          </span>
          <span style={{ background: diff.bg, color: diff.color, border: `1px solid ${diff.color}`, borderRadius: "999px", padding: "0.18rem 0.55rem", fontSize: "0.74rem", fontWeight: 700, textTransform: "capitalize" }}>
            {lesson.difficulty}
          </span>
          <span className="tag">{lesson.subtitle}</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "auto" }}>{lesson.duration}</span>
        </div>
        <h1 style={{ margin: "0 0 0.55rem", fontSize: "1.85rem", lineHeight: 1.2, letterSpacing: "-0.03em" }}>{lesson.title}</h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.75 }}>{lesson.summary}</p>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(270px, 0.8fr)", gap: "1rem" }}>
        <div className="card">
          <div style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.6rem" }}>
            Why this lesson matters in the course
          </div>
          <p style={{ margin: 0, color: "var(--text)", lineHeight: 1.75, fontSize: "0.92rem" }}>
            {unit ? unit.description : "This lesson explains one of the major architectural checkpoints in the CVA6 pipeline."}
          </p>
          {unit && (
            <p style={{ margin: "0.8rem 0 0", color: "var(--blue)", lineHeight: 1.7, fontSize: "0.88rem" }}>
              <strong>Professor&apos;s framing:</strong> {unit.designQuestion}
            </p>
          )}
        </div>

        <div className="card">
          <div style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.6rem" }}>
            If you were building this in SystemVerilog
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "grid", gap: "0.55rem" }}>
            {svTakeaways.map((item) => (
              <li key={item} style={{ color: "var(--text)", fontSize: "0.88rem", lineHeight: 1.65 }}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <div>
        {lesson.body.split("\n").map((line, i) => {
          const t = line.trim();
          if (!t) return <div key={i} style={{ height: "0.6rem" }} />;

          if (/^─{5,}/.test(t)) return <hr key={i} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "1rem 0" }} />;

          if (/^[A-Z][A-Z0-9\s\-\/()]+:$/.test(t) && t.length < 100) {
            return (
              <div key={i} style={{ margin: "1.5rem 0 0.45rem", fontSize: "0.78rem", fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", borderLeft: "3px solid var(--accent)", paddingLeft: "0.7rem" }}>
                {t}
              </div>
            );
          }

          if (/^(STEP\s+\d|[1-9]\d*\.)/.test(t)) {
            const inlined = t.replace(/`([^`]+)`/g, (_, c) => `<code style="background:var(--surface2);padding:0.05rem 0.3rem;border-radius:3px;font-family:monospace;font-size:0.82em;color:var(--accent)">${c}</code>`);
            return <p key={i} style={{ margin: "0.6rem 0 0.25rem 0.5rem", lineHeight: 1.75, color: "var(--text)", fontSize: "0.93rem", fontWeight: 700 }} dangerouslySetInnerHTML={{ __html: inlined }} />;
          }

          if (/^\s*(•|—|–|\*)/.test(line)) {
            const inlined = t.replace(/`([^`]+)`/g, (_, c) => `<code style="background:var(--surface2);padding:0.05rem 0.3rem;border-radius:3px;font-family:monospace;font-size:0.82em;color:var(--accent)">${c}</code>`);
            return <p key={i} style={{ margin: "0.1rem 0 0.1rem 1.4rem", lineHeight: 1.65, color: "var(--text-muted)", fontSize: "0.88rem" }} dangerouslySetInnerHTML={{ __html: inlined }} />;
          }

          const rendered = t.replace(/`([^`]+)`/g, (_, c) => `<code style="background:var(--surface2);padding:0.05rem 0.3rem;border-radius:3px;font-family:monospace;font-size:0.82em;color:var(--accent)">${c}</code>`);
          return <p key={i} style={{ margin: "0 0 0.55rem", lineHeight: 1.82, color: "var(--text)", fontSize: "0.93rem" }} dangerouslySetInnerHTML={{ __html: rendered }} />;
        })}
      </div>

      {lesson.snippets.map((snippet, i) => (
        <div key={i} style={{ marginBottom: "0.5rem" }}>
          <div style={{ background: "#0d1117", border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
            <div style={{ padding: "0.6rem 1rem", borderBottom: "1px solid #30363d", display: "flex", alignItems: "center", gap: "0.5rem", background: "#161b22" }}>
              <span style={{ color: "#00ff88", fontSize: "0.8rem" }}>⬡</span>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#c9d1d9" }}>{snippet.label}</span>
            </div>
            {snippet.annotation && (
              <div style={{ padding: "0.55rem 1rem", background: "#1c2128", borderBottom: "1px solid #30363d", fontSize: "0.78rem", color: "#8b949e", fontStyle: "italic" }}>
                💬 {snippet.annotation}
              </div>
            )}
            <pre style={{ margin: 0, padding: "1.15rem 1rem", overflowX: "auto", fontFamily: "'Geist Mono', 'Fira Code', monospace", fontSize: "0.8rem", lineHeight: 1.72, color: "#c9d1d9", background: "#0d1117" }}>
              <code>{snippet.code}</code>
            </pre>
          </div>
        </div>
      ))}

      <section className="card">
        <div style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.8rem" }}>
          Key signals you should be able to explain on a whiteboard
        </div>
        <div style={{ display: "grid", gap: "0.8rem" }}>
          {lesson.keySignals.map((sig, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 220px) minmax(0, 1fr)", gap: "0.8rem" }}>
              <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "0.12rem 0.38rem", borderRadius: "999px", background: sig.direction === "input" ? "#0d2a3a" : sig.direction === "output" ? "#0d2a1a" : "#2b2638", color: sig.direction === "input" ? "#00aaff" : sig.direction === "output" ? "#00ff88" : "#d7a8ff", border: `1px solid ${sig.direction === "input" ? "#00aaff" : sig.direction === "output" ? "#00ff88" : "#d7a8ff"}`, textTransform: "uppercase" }}>
                  {sig.direction}
                </span>
                <code style={{ fontSize: "0.78rem", color: "var(--accent)" }}>{sig.name}</code>
              </div>
              <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-muted)", lineHeight: 1.7 }}>{sig.explanation}</p>
            </div>
          ))}
        </div>
      </section>

      {lesson.designDecisions.length > 0 && (
        <section className="card" style={{ borderColor: "#2b3240" }}>
          <div style={{ fontSize: "0.78rem", color: "#9fc0ff", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Design decisions worth stealing
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", display: "grid", gap: "0.6rem" }}>
            {lesson.designDecisions.map((d, i) => (
              <li key={i} style={{ color: "var(--text)", lineHeight: 1.7, fontSize: "0.89rem" }}>{d}</li>
            ))}
          </ul>
        </section>
      )}

      {relatedQs.length > 0 && (
        <section className="card">
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Practice this lesson verbally
          </div>
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {relatedQs.map((q) => {
              const qIdx = questions.filter((x) => x.level === q.level).findIndex((x) => x.id === q.id);
              return (
                <Link key={q.id} href={`/practice/${q.level}?q=${qIdx}`} style={{ textDecoration: "none" }}>
                  <div style={{ padding: "0.7rem 0.85rem", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.8rem" }}>
                    <div>
                      <span style={{ fontSize: "0.72rem", color: "var(--accent)", fontWeight: 700, marginRight: "0.55rem" }}>L{q.level} · {q.topic}</span>
                      <span style={{ fontSize: "0.82rem", color: "var(--text)" }}>{q.question.slice(0, 100)}…</span>
                    </div>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", flexShrink: 0 }}>→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.4rem", borderTop: "1px solid var(--border)" }}>
        <Link href="/learn"><button className="btn-ghost">← Curriculum</button></Link>
        <Link href="/hierarchy"><button className="btn-ghost">Module map →</button></Link>
      </div>
    </div>
  );
}

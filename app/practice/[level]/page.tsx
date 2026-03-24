"use client";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { questions } from "@/lib/questions";
import { Question } from "@/lib/types";
import { loadProgress, saveAnswer } from "@/lib/progress";
import Link from "next/link";

export default function PracticePage() {
  const params = useParams();
  const router = useRouter();
  const level = parseInt(params.level as string) as 1|2|3;

  const levelQs = questions.filter((q) => q.level === level);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [selfScore, setSelfScore] = useState<number | null>(null);
  const [progress, setProgress] = useState(loadProgress());

  useEffect(() => {
    const p = loadProgress();
    setProgress(p);
    if (!p.unlockedLevels.includes(level)) router.push("/");
    // Start from first unanswered question
    const firstUnanswered = levelQs.findIndex((q) => !p.answers.find((a) => a.questionId === q.id));
    setIdx(firstUnanswered >= 0 ? firstUnanswered : 0);
  }, []);

  if (!levelQs.length) return <div>Invalid level.</div>;

  const q: Question = levelQs[idx];
  const prevAnswer = progress.answers.find((a) => a.questionId === q.id);

  const handleSubmit = () => { if (answer.trim()) setSubmitted(true); };

  const handleScore = (score: number) => {
    setSelfScore(score);
    saveAnswer(q.id, score);
    setProgress(loadProgress());
  };

  const handleNext = () => {
    setSubmitted(false);
    setSelfScore(null);
    setAnswer("");
    if (idx < levelQs.length - 1) setIdx(idx + 1);
    else router.push("/");
  };

  const answeredCount = progress.answers.filter((a) => levelQs.some((q) => q.id === a.questionId)).length;

  return (
    <div>
      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.9rem" }}>← Back</Link>
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Level {level}</span>
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>·</span>
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{answeredCount}/{levelQs.length} answered</span>
      </div>

      {/* Question selector */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {levelQs.map((lq, i) => {
          const done = progress.answers.find((a) => a.questionId === lq.id);
          return (
            <button key={lq.id}
              onClick={() => { setIdx(i); setSubmitted(false); setSelfScore(null); setAnswer(""); }}
              style={{
                padding: "0.3rem 0.75rem", borderRadius: "4px", border: "1px solid",
                borderColor: i === idx ? "var(--accent)" : done ? "#2a4a3a" : "var(--border)",
                background: i === idx ? "#00ff8822" : done ? "#1a2e22" : "var(--surface)",
                color: i === idx ? "var(--accent)" : done ? "#00cc6a" : "var(--text-muted)",
                cursor: "pointer", fontSize: "0.8rem", fontWeight: i === idx ? 700 : 400,
              }}>
              Q{i + 1} {done ? "✓" : ""}
            </button>
          );
        })}
      </div>

      {/* Question card */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <span className="tag">Q{idx + 1}/{levelQs.length}</span>
            <span className="tag">{q.topic}</span>
            <span className="tag">Level {level}</span>
          </div>
          {prevAnswer && (
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Last score: <strong style={{ color: prevAnswer.score >= 6 ? "var(--accent)" : "var(--yellow)" }}>{prevAnswer.score}/10</strong>
            </span>
          )}
        </div>
        <p style={{ fontSize: "1.05rem", lineHeight: 1.65, margin: 0 }}>{q.question}</p>
      </div>

      {/* Answer area */}
      {!submitted ? (
        <div>
          <textarea
            rows={8}
            placeholder="Write your answer here. Be specific — vague answers get called out."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
            <button className="btn-primary" onClick={handleSubmit} disabled={!answer.trim()}>
              Submit Answer
            </button>
            <button className="btn-ghost" onClick={() => { setSubmitted(true); setAnswer(""); }}>
              Skip — show reference
            </button>
          </div>
        </div>
      ) : (
        <div>
          {/* Your answer */}
          {answer.trim() && (
            <div className="card" style={{ marginBottom: "1.25rem", borderColor: "#2a4a3a" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Your Answer</div>
              <p style={{ margin: 0, lineHeight: 1.6, color: "var(--text)", whiteSpace: "pre-wrap" }}>{answer}</p>
            </div>
          )}

          {/* Reference answer */}
          <div className="card" style={{ marginBottom: "1.25rem", borderColor: "#1a3a2a" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--accent)", marginBottom: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Reference Answer</div>
            <pre style={{ margin: 0, lineHeight: 1.6, color: "var(--text)", whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.95rem" }}>{q.reference_answer}</pre>
          </div>

          {/* Concept explanation */}
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Concept Explanation</div>
            <p style={{ margin: 0, lineHeight: 1.75, color: "var(--text)", whiteSpace: "pre-wrap" }}>{q.explanation}</p>
          </div>

          {/* Resources */}
          {q.resources.length > 0 && (
            <div className="card" style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>See It In Real Code / Papers</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {q.resources.map((r) => (
                  <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: "var(--accent)", fontSize: "0.9rem", textDecoration: "none" }}>
                    ↗ {r.title} <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>[{r.type}]</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Self-scoring */}
          {answer.trim() && selfScore === null && (
            <div className="card" style={{ marginBottom: "1.25rem", borderColor: "var(--border)" }}>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>How well did you do? (be honest)</div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {[0,1,2,3,4,5,6,7,8,9,10].map((s) => (
                  <button key={s} onClick={() => handleScore(s)}
                    style={{
                      padding: "0.4rem 0.75rem", borderRadius: "4px", border: "1px solid",
                      borderColor: s >= 7 ? "var(--accent)" : s >= 4 ? "var(--yellow)" : "var(--red)",
                      background: "transparent",
                      color: s >= 7 ? "var(--accent)" : s >= 4 ? "var(--yellow)" : "var(--red)",
                      cursor: "pointer", fontWeight: 700,
                    }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(selfScore !== null || !answer.trim()) && (
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              {selfScore !== null && (
                <span className={`score-badge ${selfScore >= 7 ? "score-good" : selfScore >= 4 ? "score-mid" : "score-low"}`}>
                  {selfScore}
                </span>
              )}
              <button className="btn-primary" onClick={handleNext}>
                {idx < levelQs.length - 1 ? "Next Question →" : "Finish Level →"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { questions } from "@/lib/questions";
import { Question } from "@/lib/types";

type MockState = "setup" | "question" | "reviewing" | "finished";

interface MockResult {
  question: Question;
  answer: string;
  score: number | null;
  skipped: boolean;
}

function pickQuestions(): Question[] {
  const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);
  const l1 = shuffle(questions.filter((q) => q.level === 1)).slice(0, 3);
  const l2 = shuffle(questions.filter((q) => q.level === 2)).slice(0, 3);
  const l34 = shuffle(questions.filter((q) => q.level === 3 || q.level === 4)).slice(0, 2);
  return [...l1, ...l2, ...l34];
}

const TOTAL = 8;
const SECONDS = 120;

export default function MockPage() {
  const [state, setState] = useState<MockState>("setup");
  const [pool, setPool] = useState<Question[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [timeLeft, setTimeLeft] = useState(SECONDS);
  const [results, setResults] = useState<MockResult[]>([]);
  const [pendingResult, setPendingResult] = useState<MockResult | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const startTimer = () => {
    setTimeLeft(SECONDS);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  const handleStart = () => {
    const picked = pickQuestions();
    setPool(picked);
    setQIdx(0);
    setResults([]);
    setAnswer("");
    setState("question");
    startTimer();
  };

  const handleSubmitOrSkip = (skipped: boolean) => {
    stopTimer();
    const q = pool[qIdx];
    const result: MockResult = { question: q, answer: skipped ? "" : answer, score: null, skipped };
    setPendingResult(result);
    setState("reviewing");
  };

  const handleScore = (score: number) => {
    if (!pendingResult) return;
    const finalResult = { ...pendingResult, score };
    const newResults = [...results, finalResult];
    setResults(newResults);
    setPendingResult(null);

    if (qIdx + 1 >= TOTAL) {
      setState("finished");
    } else {
      setQIdx(qIdx + 1);
      setAnswer("");
      setState("question");
      startTimer();
    }
  };

  const handleSkipScore = () => {
    if (!pendingResult) return;
    const finalResult = { ...pendingResult, score: 0 };
    const newResults = [...results, finalResult];
    setResults(newResults);
    setPendingResult(null);

    if (qIdx + 1 >= TOTAL) {
      setState("finished");
    } else {
      setQIdx(qIdx + 1);
      setAnswer("");
      setState("question");
      startTimer();
    }
  };

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const timerRed = timeLeft < 30;

  if (state === "setup") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
          <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.9rem" }}>← Back</Link>
        </div>
        <div className="card" style={{ maxWidth: "540px", margin: "0 auto", textAlign: "center", padding: "2.5rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⏱</div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0 0 0.75rem" }}>Mock Interview</h1>
          <p style={{ color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 1.5rem" }}>
            8 questions drawn from all levels (3 × L1, 3 × L2, 2 × L3/L4). You have <strong>2 minutes</strong> per question.
            No hints. Score yourself honestly after each answer.
          </p>
          <button className="btn-primary" style={{ width: "100%", fontSize: "1rem", padding: "0.8rem" }} onClick={handleStart}>
            Start Interview →
          </button>
        </div>
      </div>
    );
  }

  if (state === "question") {
    const q = pool[qIdx];
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Question {qIdx + 1} / {TOTAL}</span>
          <span style={{
            fontWeight: 800, fontSize: "1.3rem", fontVariantNumeric: "tabular-nums",
            color: timerRed ? "#ff4444" : "var(--accent)",
          }}>
            {mm}:{ss}
          </span>
        </div>
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <span className="tag">L{q.level}</span>
            <span className="tag">{q.topic}</span>
          </div>
          <p style={{ fontSize: "1.05rem", lineHeight: 1.65, margin: 0 }}>{q.question}</p>
        </div>
        <textarea
          rows={8}
          placeholder="Write your answer here…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
          <button className="btn-primary" disabled={!answer.trim()} onClick={() => handleSubmitOrSkip(false)}>
            Submit
          </button>
          <button className="btn-ghost" onClick={() => handleSubmitOrSkip(true)}>
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (state === "reviewing" && pendingResult) {
    const q = pendingResult.question;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Review — Question {qIdx + 1} / {TOTAL}</span>
        </div>

        {pendingResult.answer && (
          <div className="card" style={{ marginBottom: "1.25rem", borderColor: "#2a4a3a" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Your Answer</div>
            <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{pendingResult.answer}</p>
          </div>
        )}
        {pendingResult.skipped && (
          <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem", fontStyle: "italic" }}>You skipped this question.</div>
        )}

        <div className="card" style={{ marginBottom: "1.25rem", borderColor: "#1a3a2a" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--accent)", marginBottom: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Reference Answer</div>
          <pre style={{ margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.95rem" }}>{q.reference_answer}</pre>
        </div>

        {pendingResult.answer && (
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>Self-score (0–10)</div>
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

        {pendingResult.skipped && (
          <button className="btn-primary" onClick={handleSkipScore}>
            {qIdx + 1 >= TOTAL ? "See Results →" : "Next Question →"}
          </button>
        )}
      </div>
    );
  }

  if (state === "finished") {
    const scored = results.filter((r) => r.score !== null);
    const avg = scored.length > 0 ? scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length : 0;
    const avgRounded = Math.round(avg * 10) / 10;
    const pass = avg >= 6;

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Mock Interview — Results</span>
        </div>

        <div className="card" style={{ marginBottom: "1.5rem", textAlign: "center" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Average Score</div>
          <div style={{ fontSize: "2.5rem", fontWeight: 800, color: pass ? "var(--accent)" : "var(--red)" }}>{avgRounded}/10</div>
          <div style={{
            display: "inline-block", marginTop: "0.5rem", padding: "0.3rem 1rem", borderRadius: "4px",
            background: pass ? "#1a3a2a" : "#3a1a1a",
            color: pass ? "var(--accent)" : "var(--red)",
            fontWeight: 800, fontSize: "1.1rem", border: `1px solid ${pass ? "var(--accent)" : "var(--red)"}`,
          }}>
            {pass ? "PASS ✓" : "FAIL ✗"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {results.map((r, i) => (
            <div key={i} className="card" style={{ borderColor: r.score !== null && r.score >= 7 ? "#2a4a3a" : r.score !== null && r.score >= 4 ? "#3a3a1a" : "#3a1a1a" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
                    Q{i + 1} · L{r.question.level} · {r.question.topic}
                  </div>
                  <div style={{ fontSize: "0.9rem", lineHeight: 1.4 }}>{r.question.question}</div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {r.skipped ? (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>skipped</span>
                  ) : (
                    <span className={`score-badge ${r.score !== null && r.score >= 7 ? "score-good" : r.score !== null && r.score >= 4 ? "score-mid" : "score-low"}`}>
                      {r.score}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button className="btn-primary" onClick={handleStart}>Try Again</button>
          <Link href="/"><button className="btn-ghost">Back to Home</button></Link>
        </div>
      </div>
    );
  }

  return null;
}

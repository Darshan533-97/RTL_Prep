"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { courseUnits } from "@/lib/course";
import { loadProgress, getLevelStats } from "@/lib/progress";
import { questions } from "@/lib/questions";
import { UserProgress } from "@/lib/types";

const LEVELS = [
  { id: 1, label: "Level 1", title: "Foundations" },
  { id: 2, label: "Level 2", title: "Microarchitecture" },
  { id: 3, label: "Level 3", title: "Advanced CPU Systems" },
  { id: 4, label: "Level 4", title: "Production RTL Cells" },
] as const;

export default function Home() {
  const [progress, setProgress] = useState<UserProgress>({ answers: [], unlockedLevels: [1] });

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  const totalAnswered = progress.answers.length;
  const totalQ = questions.length;
  const totalPct = Math.round((totalAnswered / totalQ) * 100);

  const interviewTrack = useMemo(
    () =>
      LEVELS.map((lvl) => {
        const levelQs = questions.filter((q) => q.level === lvl.id);
        const stats = getLevelStats(lvl.id, progress.answers, levelQs.length);
        return { lvl, stats, total: levelQs.length };
      }),
    [progress.answers]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section className="hero-card">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 1fr)", gap: "1.5rem", alignItems: "start" }}>
          <div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.9rem" }}>
              <span className="tag">CVA6 as the running example</span>
              <span className="tag">SystemVerilog design guidance</span>
              <span className="tag">Step-by-step CPU curriculum</span>
            </div>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.3rem)", lineHeight: 1.03, margin: 0, letterSpacing: "-0.05em" }}>
              Learn CPU design the way a great architecture professor would teach it.
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "1rem", lineHeight: 1.75, margin: "1rem 0 1.2rem" }}>
              RTL Prep is now organized as a coherent journey through a real out-of-order core. You start by learning the typed data structures that make CVA6 readable, then progress through frontend fetch, decode, scoreboarding, execute units, memory systems, and commit/CSR control. Every section answers two questions: <em>what does this module do?</em> and <em>how would you design something like it in SystemVerilog?</em>
            </p>
            <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
              <Link href="/learn"><button className="btn-primary">Start the curriculum →</button></Link>
              <Link href="/hierarchy"><button className="btn-ghost">Browse the CVA6 module map</button></Link>
            </div>
          </div>

          <div className="card" style={{ padding: "1.1rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
              Course posture
            </div>
            <div style={{ display: "grid", gap: "0.9rem", marginTop: "0.8rem" }}>
              {[
                ["1", "Follow the pipeline in architectural order"],
                ["2", "Use CVA6 modules as concrete anchors"],
                ["3", "Extract reusable RTL design patterns"],
                ["4", "Pressure-test your understanding with interview drills"],
              ].map(([n, text]) => (
                <div key={n} style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start" }}>
                  <div style={{ width: "1.6rem", height: "1.6rem", borderRadius: "50%", border: "1px solid var(--accent)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>
                    {n}
                  </div>
                  <div style={{ color: "var(--text)", fontSize: "0.9rem", lineHeight: 1.55 }}>{text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "end", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>The learning path</div>
            <h2 style={{ margin: "0.35rem 0 0", fontSize: "1.4rem", letterSpacing: "-0.03em" }}>Seven units from fetch to debug infrastructure</h2>
          </div>
          <Link href="/learn" style={{ color: "var(--accent)", fontSize: "0.9rem", textDecoration: "none" }}>
            View full curriculum →
          </Link>
        </div>

        <div className="grid-auto">
          {courseUnits.map((unit) => (
            <div key={unit.id} style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "1rem", background: unit.order === 0 ? "var(--surface3)" : "var(--surface)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.55rem" }}>
                <span style={{ fontSize: "0.74rem", fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Unit {unit.order}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{unit.lessonIds.length || 1} stop{unit.lessonIds.length === 1 ? "" : "s"}</span>
              </div>
              <h3 style={{ margin: "0 0 0.45rem", fontSize: "1rem", lineHeight: 1.35 }}>{unit.shortTitle}</h3>
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: 1.6 }}>{unit.description}</p>
              <div style={{ marginTop: "0.75rem", fontSize: "0.76rem", color: "var(--blue)", lineHeight: 1.5 }}>
                Design question: {unit.designQuestion}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)", gap: "1.5rem" }}>
        <div className="card">
          <div style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.6rem" }}>
            What makes this course different
          </div>
          <div style={{ display: "grid", gap: "0.9rem" }}>
            {[
              {
                title: "Architecture first, module second",
                text: "Students usually drown in filenames. Here, the pipeline story comes first so each module lands in the right mental slot.",
              },
              {
                title: "Design guidance, not just code annotation",
                text: "Lessons repeatedly explain the implementation pattern: how you would build the same queue, scoreboard, predictor, or trap path in your own RTL.",
              },
              {
                title: "Real source tree, curated reading order",
                text: "The hierarchy explorer is still here, but now it supports the course instead of replacing it.",
              },
            ].map((item) => (
              <div key={item.title} style={{ padding: "0.95rem", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface2)" }}>
                <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>{item.title}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.65 }}>{item.text}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.7rem" }}>
            <span style={{ fontWeight: 700 }}>Interview practice still lives here</span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{totalAnswered}/{totalQ} answered</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${totalPct}%` }} />
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "0.45rem", marginBottom: "1rem" }}>{totalPct}% complete</div>

          <div style={{ display: "grid", gap: "0.7rem" }}>
            {interviewTrack.map(({ lvl, stats, total }) => (
              <Link key={lvl.id} href={`/practice/${lvl.id}`} style={{ textDecoration: "none" }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "0.85rem", background: "var(--surface2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>{lvl.label}: {lvl.title}</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{stats.answered}/{total} done · avg {stats.avgScore}/10</div>
                    </div>
                    <span style={{ color: "var(--accent)", fontSize: "0.85rem" }}>→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

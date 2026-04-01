"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { loadProgress, getLevelStats } from "@/lib/progress";
import { questions } from "@/lib/questions";
import { UserProgress } from "@/lib/types";

const LEVELS = [
  { id: 1, label: "Level 1", title: "Foundations",       desc: "Flip-flops, combinational/sequential logic, FSMs, basic Verilog syntax, setup/hold, clock domains." },
  { id: 2, label: "Level 2", title: "Intermediate",      desc: "Pipeline hazards, forwarding, cache design, CDC, AXI protocol, timing constraints, FIFO design." },
  { id: 3, label: "Level 3", title: "Advanced",          desc: "Out-of-order execution, branch prediction, memory consistency, cache coherence, systolic arrays." },
  { id: 4, label: "Level 4", title: "Real-World Cells",  desc: "Implement production RTL cells: LZC, spill register, FIFO, round-robin arbiter, PLRU tree, CDC FIFO, Gray code, synchronizer." },
];

export default function Home() {
  const [progress, setProgress] = useState<UserProgress>({ answers: [], unlockedLevels: [1] });

  useEffect(() => { setProgress(loadProgress()); }, []);

  const totalQ = questions.length;
  const totalAnswered = progress.answers.length;
  const totalPct = Math.round((totalAnswered / totalQ) * 100);

  return (
    <div>
      <div style={{ marginBottom: "2.5rem" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>
          RTL &amp; CPU Design Interview Prep
        </h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.95rem" }}>
          32 curated questions across 4 difficulty levels. Unlock the next level by averaging ≥6/10 on the previous.
        </p>
      </div>

      {/* Overall progress */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <span style={{ fontWeight: 600 }}>Overall Progress</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{totalAnswered} / {totalQ} questions answered</span>
        </div>
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${totalPct}%` }} />
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "0.4rem" }}>{totalPct}% complete</div>
      </div>

      {/* Level cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem" }}>
        {LEVELS.map((lvl) => {
          const levelQs = questions.filter((q) => q.level === lvl.id);
          const stats = getLevelStats(lvl.id as 1|2|3|4, progress.answers, levelQs.length);
          return (
            <div key={lvl.id} className="card" style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                <span style={{ background: "var(--surface2)", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: "4px", padding: "0.15rem 0.5rem", fontSize: "0.75rem", fontWeight: 700 }}>{lvl.label}</span>
                <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>{lvl.title}</span>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.5, margin: "0 0 1rem 0" }}>{lvl.desc}</p>

              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                  <span>{stats.answered}/{stats.total} done</span>
                  {stats.answered > 0 && <span>Avg: <strong style={{ color: stats.avgScore >= 6 ? "var(--accent)" : "var(--yellow)" }}>{stats.avgScore}/10</strong></span>}
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${stats.pct}%` }} />
                </div>
              </div>

              <Link href={`/practice/${lvl.id}`}>
                <button className="btn-primary" style={{ width: "100%" }}>
                  {stats.answered === 0 ? "Start" : stats.answered === stats.total ? "Review" : "Continue"} →
                </button>
              </Link>
            </div>
          );
        })}
      </div>

      {/* Extra nav */}
      <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
        <Link href="/mock"><button className="btn-ghost">⏱ Mock Interview</button></Link>
        <Link href="/learn"><button className="btn-ghost">📚 Deep Dive Lessons</button></Link>
        <Link href="/hierarchy"><button className="btn-ghost">🗂️ Source Hierarchy</button></Link>
      </div>

      {/* Quick Jump */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h3 style={{ margin: "0 0 1rem 0", fontSize: "0.95rem", fontWeight: 700 }}>🎯 Jump to Any Question</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {LEVELS.map((lvl) => {
            const levelQs = questions.filter((q) => q.level === lvl.id);
            return (
              <div key={lvl.id}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.4rem", fontWeight: 600 }}>
                  {lvl.label}: {lvl.title}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  {levelQs.map((q, i) => {
                    const ans = progress.answers.find((a) => a.questionId === q.id);
                    const score = ans?.score;
                    const borderColor = score !== undefined ? (score >= 7 ? "#00ff88" : score >= 4 ? "#ffdd00" : "#ff4444") : "var(--border)";
                    const bg = score !== undefined ? (score >= 7 ? "#0d2a1a" : score >= 4 ? "#2a2a0d" : "#2a0d0d") : "var(--surface)";
                    return (
                      <Link key={q.id} href={`/practice/${lvl.id}?q=${i}`}>
                        <button style={{
                          padding: "0.25rem 0.6rem", borderRadius: "4px", border: `1px solid ${borderColor}`,
                          background: bg, color: borderColor, cursor: "pointer",
                          fontSize: "0.75rem", fontWeight: 600,
                        }} title={q.topic}>
                          Q{i + 1}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resources */}
      <div className="card" style={{ marginTop: "2rem" }}>
        <h3 style={{ margin: "0 0 1rem 0", fontSize: "0.95rem", fontWeight: 700 }}>Reference Resources</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "0.5rem" }}>
          {[
            { label: "CVA6 (RISC-V OoO Core)", url: "https://github.com/openhwgroup/cva6" },
            { label: "PicoRV32 (Minimal RISC-V)", url: "https://github.com/YosysHQ/picorv32" },
            { label: "VexRiscv (SpinalHDL CPU)", url: "https://github.com/SpinalHDL/VexRiscv" },
            { label: "BOOM OoO RISC-V", url: "https://github.com/riscv-boom/riscv-boom" },
            { label: "RISC-V ISA Specification", url: "https://riscv.org/technical/specifications/" },
            { label: "riscv-formal (Formal Verification)", url: "https://github.com/YosysHQ/riscv-formal" },
            { label: "Gemmini Systolic Array", url: "https://github.com/ucb-bar/gemmini" },
            { label: "Google TPU v1 Paper", url: "https://arxiv.org/abs/1704.04760" },
          ].map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--accent)", fontSize: "0.85rem", textDecoration: "none", padding: "0.4rem 0.6rem", background: "var(--surface2)", borderRadius: "4px", display: "block" }}>
              ↗ {r.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

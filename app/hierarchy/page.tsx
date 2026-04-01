"use client";
import Link from "next/link";
import { useState } from "react";
import { cva6Hierarchy, getHierarchyByCategory, IMPORTANCE_ORDER, type SourceFile } from "@/lib/hierarchy";

const IMPORTANCE_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  top:       { color: "#ff8800", bg: "#2a1a00", label: "Top" },
  critical:  { color: "#00ff88", bg: "#0d2a1a", label: "Critical" },
  supporting:{ color: "#ffdd00", bg: "#2a2a0d", label: "Supporting" },
  utility:   { color: "#aaaaaa", bg: "#1a1a1a", label: "Utility" },
};

const CATEGORY_ICON: Record<string, string> = {
  "Top Level": "⬡",
  "Frontend": "📡",
  "Decode & Issue": "🔍",
  "Execute": "⚡",
  "Memory & Cache": "💾",
  "MMU & TLB": "🗺️",
  "Privileged Architecture": "🔒",
  "Floating Point": "🔢",
  "Debug": "🐛",
  "Common Cells": "🔧",
  "Packages & Config": "📦",
};

function FileCard({ file, expanded, onToggle }: { file: SourceFile; expanded: boolean; onToggle: () => void }) {
  const imp = IMPORTANCE_STYLE[file.importance];
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", marginBottom: "0.5rem" }}>
      <div
        style={{ padding: "0.65rem 0.9rem", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: "0.75rem", background: "var(--surface)" }}
        onClick={onToggle}
      >
        {/* Importance badge */}
        <span style={{ flexShrink: 0, fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.4rem", borderRadius: "3px", background: imp.bg, color: imp.color, border: `1px solid ${imp.color}`, marginTop: "0.1rem" }}>
          {imp.label}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <code style={{ fontSize: "0.82rem", color: "var(--accent)", fontWeight: 700 }}>{file.module}</code>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "monospace" }}>{file.path}</span>
          </div>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            {file.description.slice(0, 140)}{file.description.length > 140 ? "…" : ""}
          </p>
        </div>
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0.9rem 1rem", background: "#0d1117", borderTop: "1px solid var(--border)" }}>
          <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.7 }}>{file.description}</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "0.75rem" }}>
            {/* Instantiated By */}
            <div>
              <div style={{ fontSize: "0.7rem", color: "#aaaaff", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>
                ← Instantiated By
              </div>
              {file.instantiatedBy.map((p, i) => (
                <div key={i} style={{ fontSize: "0.78rem", color: "var(--text-muted)", padding: "0.15rem 0" }}>
                  <code style={{ color: "#aaaaff" }}>{p}</code>
                </div>
              ))}
            </div>

            {/* Instantiates */}
            <div>
              <div style={{ fontSize: "0.7rem", color: "#00ff88", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>
                → Instantiates
              </div>
              {file.instantiates.length === 0 ? (
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic" }}>leaf module</div>
              ) : file.instantiates.map((c, i) => (
                <div key={i} style={{ fontSize: "0.78rem", color: "var(--text-muted)", padding: "0.15rem 0" }}>
                  <code style={{ color: "#00ff88" }}>{c}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Key Signals */}
          {file.keySignals && file.keySignals.length > 0 && (
            <div>
              <div style={{ fontSize: "0.7rem", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>
                Key Signals
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                {file.keySignals.map((sig, i) => (
                  <span key={i} style={{ fontSize: "0.72rem", fontFamily: "monospace", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "3px", padding: "0.1rem 0.4rem", color: "var(--accent)" }}>
                    {sig.split(" (")[0]}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HierarchyPage() {
  const byCategory = getHierarchyByCategory();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("");

  const toggle = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const filteredFiles = filter
    ? cva6Hierarchy.filter(f =>
        f.module.toLowerCase().includes(filter.toLowerCase()) ||
        f.path.toLowerCase().includes(filter.toLowerCase()) ||
        f.description.toLowerCase().includes(filter.toLowerCase())
      )
    : null;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/learn" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.9rem" }}>← Back to Lessons</Link>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0.75rem 0 0.4rem", letterSpacing: "-0.02em" }}>
          🗂️ CVA6 Source Hierarchy
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: 0, lineHeight: 1.6 }}>
          Complete module tree for CVA6 RISC-V CPU (ETH Zurich / OpenHW Group). {cva6Hierarchy.length} modules mapped with instantiation relationships and key signals.
        </p>
      </div>

      {/* Module hierarchy summary card */}
      <div className="card" style={{ marginBottom: "1.5rem", fontFamily: "monospace", fontSize: "0.76rem", lineHeight: 1.9, color: "#8b949e" }}>
        <div style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 700, marginBottom: "0.75rem", fontFamily: "inherit" }}>
          📐 CVA6 Instantiation Tree (core/cva6.sv is the root)
        </div>
        <pre style={{ margin: 0, overflowX: "auto", color: "#c9d1d9" }}>{`cva6 (cva6.sv)
├── controller (controller.sv)                       ← pipeline flush logic
├── frontend (frontend/frontend.sv)                  ← fetch + branch prediction
│   ├── bht (frontend/bht.sv)                        ← 2-bit saturating counter BHT
│   ├── bht2lvl (frontend/bht2lvl.sv)               ← gshare predictor (alt)
│   ├── btb (frontend/btb.sv)                        ← branch target buffer
│   └── instr_queue                                  ← fetch→decode FIFO
├── id_stage (id_stage.sv)                           ← decode
│   ├── decoder (decoder.sv)                         ← opcode → scoreboard_entry_t
│   └── compressed_decoder (compressed_decoder.sv)  ← C-ext expansion
├── issue_stage (issue_stage.sv)                     ← issue + reg file read
│   ├── scoreboard (scoreboard.sv)                   ← OoO tracking table
│   └── ariane_regfile_ff (ariane_regfile_ff.sv)    ← 32×64 register file
├── ex_stage (ex_stage.sv)                           ← execute orchestrator
│   ├── alu (alu.sv)                                 ← integer ALU (combinational)
│   │   └── alu_wrapper (alu_wrapper.sv)            ← adds valid/ready
│   ├── branch_unit (branch_unit.sv)                ← resolve + mispredict
│   ├── mult (mult.sv)                               ← MUL/DIV unit
│   │   ├── multiplier (multiplier.sv)              ← 3-cycle pipelined MUL
│   │   └── serdiv (serdiv.sv)                      ← iterative 64-cycle DIV
│   ├── fpu_wrap (fpu_wrap.sv)                      ← FP operations
│   │   └── fpnew_top (cvfpu/)                      ← CV-FPU from ETH Zurich
│   └── load_store_unit (load_store_unit.sv)        ← memory access
│       ├── load_unit (load_unit.sv)                ← loads + cache reads
│       ├── store_unit (store_unit.sv)              ← store buffer + drain
│       ├── amo_buffer (amo_buffer.sv)              ← atomic ops buffer
│       └── mmu (mmu.sv)                            ← address translation
│           ├── tlb (tlb.sv) ×2 (ITLB + DTLB)     ← TLB entries
│           └── ptw (ptw.sv)                        ← page table walker
├── commit_stage (commit_stage.sv)                  ← architectural commit
├── csr_regfile (csr_regfile.sv)                    ← CSR + privilege logic
│   └── trigger_module                              ← hardware breakpoints
├── cva6_icache_axi_wrapper                        ← I-cache
│   └── cva6_icache                                ← instruction cache
└── wt_dcache (cache_subsystem/wt_dcache.sv)       ← D-cache
    ├── cache_ctrl (cache_ctrl.sv)                 ← cache state machine
    ├── wt_dcache_mem                              ← SRAM arrays
    ├── wt_dcache_wbuffer                         ← write buffer
    └── axi_adapter (axi_adapter.sv)              ← AXI4 master`}
        </pre>
      </div>

      {/* Search */}
      <div style={{ marginBottom: "1.25rem" }}>
        <input
          type="text"
          placeholder="Search modules, files, descriptions..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ width: "100%", padding: "0.6rem 0.9rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text)", fontSize: "0.88rem", outline: "none" }}
        />
      </div>

      {/* File list — filtered or by category */}
      {filteredFiles ? (
        <div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            {filteredFiles.length} result{filteredFiles.length !== 1 ? "s" : ""}
          </div>
          {filteredFiles.map(f => (
            <FileCard key={f.path} file={f} expanded={expanded.has(f.path)} onToggle={() => toggle(f.path)} />
          ))}
        </div>
      ) : (
        Object.entries(byCategory).map(([cat, files]) => (
          <div key={cat} style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
              <span style={{ fontSize: "1rem" }}>{CATEGORY_ICON[cat] || "📄"}</span>
              <h2 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {cat}
              </h2>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "auto" }}>{files.length} module{files.length !== 1 ? "s" : ""}</span>
            </div>
            {[...files].sort((a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance]).map(f => (
              <FileCard key={f.path} file={f} expanded={expanded.has(f.path)} onToggle={() => toggle(f.path)} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

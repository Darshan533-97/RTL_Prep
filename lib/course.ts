export interface CourseUnit {
  id: string;
  order: number;
  title: string;
  shortTitle: string;
  description: string;
  designQuestion: string;
  systemVerilogFocus: string[];
  lessonIds: string[];
  moduleExamples: string[];
}

export const courseUnits: CourseUnit[] = [
  {
    id: "unit-0-language",
    order: 0,
    title: "Unit 0 — Learn the CPU's language before reading modules",
    shortTitle: "Language of the machine",
    description:
      "Start with the packed structs, transaction tags, and exception bundles that let CVA6 move instructions through the machine coherently.",
    designQuestion:
      "What data must travel with an instruction so every later stage can make correct decisions?",
    systemVerilogFocus: [
      "packed structs as typed buses",
      "parameterized interface types",
      "valid/ready discipline",
      "exception metadata carried in-band",
    ],
    lessonIds: ["stage-00-structs"],
    moduleExamples: ["cva6.sv"],
  },
  {
    id: "unit-1-frontend",
    order: 1,
    title: "Unit 1 — Frontend, fetch, and branch prediction",
    shortTitle: "Frontend & fetch",
    description:
      "Understand how the core selects the next PC, queries the I-cache, predicts control flow, and keeps decode fed without losing correctness on redirects.",
    designQuestion:
      "How do you keep the machine busy while still recovering instantly from a wrong guess?",
    systemVerilogFocus: [
      "priority PC muxes",
      "queue-based decoupling",
      "prediction tables and update paths",
      "flush and kill signals across pipeline stages",
    ],
    lessonIds: ["stage-01-frontend", "file-btb", "file-branch-unit"],
    moduleExamples: ["frontend.sv", "bht.sv", "btb.sv", "branch_unit.sv"],
  },
  {
    id: "unit-2-decode",
    order: 2,
    title: "Unit 2 — Decode and instruction interpretation",
    shortTitle: "Decode",
    description:
      "Translate instruction bits into intent: register addresses, immediates, functional-unit selection, privilege checks, and early exception detection.",
    designQuestion:
      "How do raw instruction bits become an implementation-ready control record in one clean combinational pass?",
    systemVerilogFocus: [
      "combinational decode tables",
      "immediate extraction",
      "enum-driven control generation",
      "compressed instruction expansion",
    ],
    lessonIds: ["stage-02-decode"],
    moduleExamples: ["id_stage.sv", "decoder.sv", "compressed_decoder.sv"],
  },
  {
    id: "unit-3-issue",
    order: 3,
    title: "Unit 3 — Issue logic, scoreboarding, and dependency management",
    shortTitle: "Issue & scoreboard",
    description:
      "See how CVA6 preserves in-order architectural meaning while allowing execution to proceed when operands and functional units are ready.",
    designQuestion:
      "What minimum bookkeeping lets you overlap work safely without full-blown register renaming?",
    systemVerilogFocus: [
      "scoreboard memory structures",
      "transaction IDs",
      "hazard checks and forwarding muxes",
      "dispatch valid/ready handshakes",
    ],
    lessonIds: ["stage-03-issue"],
    moduleExamples: ["issue_stage.sv", "scoreboard.sv", "ariane_regfile_ff.sv"],
  },
  {
    id: "unit-4-execute",
    order: 4,
    title: "Unit 4 — Execute units: ALU, branch, multiply/divide",
    shortTitle: "Execute units",
    description:
      "Build intuition for where arithmetic, control-flow resolution, and multi-cycle operations actually happen and how results return to the machine.",
    designQuestion:
      "How do you split computation across specialized units without making writeback and forwarding chaotic?",
    systemVerilogFocus: [
      "datapath reuse",
      "shared result buses",
      "combinational versus multi-cycle units",
      "result tagging for writeback",
    ],
    lessonIds: ["stage-04-execute"],
    moduleExamples: ["ex_stage.sv", "alu.sv", "mult.sv", "branch_unit.sv"],
  },
  {
    id: "unit-5-memory",
    order: 5,
    title: "Unit 5 — LSU, MMU, caches, and memory ordering",
    shortTitle: "LSU, MMU & cache",
    description:
      "Follow a memory operation from effective address generation through translation, cache lookup, store buffering, and precise retirement.",
    designQuestion:
      "How do you make memory fast without letting speculation corrupt the architectural state?",
    systemVerilogFocus: [
      "address generation",
      "TLB/PTW interfaces",
      "store-buffer design",
      "forwarding and alignment logic",
    ],
    lessonIds: ["file-lsu"],
    moduleExamples: ["load_store_unit.sv", "load_unit.sv", "store_unit.sv", "mmu.sv", "tlb.sv", "ptw.sv"],
  },
  {
    id: "unit-6-commit",
    order: 6,
    title: "Unit 6 — Commit, CSR control, and precise exceptions",
    shortTitle: "Commit & CSR",
    description:
      "Study the boundary where speculative work becomes architectural truth: register writes, store drain, trap entry, trap return, and privilege transitions.",
    designQuestion:
      "Where exactly does speculation end, and what state transitions must be serialized there?",
    systemVerilogFocus: [
      "architectural state updates",
      "exception-first control",
      "CSR read/modify/write rules",
      "privilege and trap sequencing",
    ],
    lessonIds: ["stage-05-commit", "file-csr"],
    moduleExamples: ["commit_stage.sv", "csr_regfile.sv"],
  },
  {
    id: "unit-7-infra",
    order: 7,
    title: "Unit 7 — Debug, packages, hierarchy, and reusable infrastructure",
    shortTitle: "Debug & infrastructure",
    description:
      "Close by reading the modules that make the design operable and scalable: package files, configuration, debug hooks, and the hierarchy that ties everything together.",
    designQuestion:
      "What non-datapath infrastructure makes a real CPU teachable, debuggable, and configurable?",
    systemVerilogFocus: [
      "package-driven enums and config structs",
      "typed parameter passing",
      "reusable cells",
      "debug and observability hooks",
    ],
    lessonIds: [],
    moduleExamples: ["ariane_pkg.sv", "config_pkg.sv", "riscv_pkg.sv", "dm_top.sv"],
  },
];

export function getUnitForLesson(lessonId: string): CourseUnit | undefined {
  return courseUnits.find((unit) => unit.lessonIds.includes(lessonId));
}

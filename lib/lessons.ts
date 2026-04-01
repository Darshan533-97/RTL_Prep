export interface CodeSnippet {
  label: string;
  language: string;
  code: string;
  annotation: string;
}

export interface Lesson {
  id: string;
  stage: number;
  category: string;
  title: string;
  subtitle: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  duration: string;
  summary: string;
  body: string;
  keySignals: { name: string; direction: string; explanation: string }[];
  snippets: CodeSnippet[];
  designDecisions: string[];
  relatedQuestions: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ALL LESSONS — CVA6 RISC-V CPU (ETH Zurich / OpenHW Group)
// Source: github.com/openhwgroup/cva6
// ─────────────────────────────────────────────────────────────────────────────

export const lessons: Lesson[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // LESSON 0: THE DATA STRUCTURES — Understanding the CPU's "language"
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "stage-00-structs",
    stage: 0,
    category: "Architecture Overview",
    title: "Before You Read Any RTL: The Data Structures That Connect Everything",
    subtitle: "CVA6 core/cva6.sv — localparam type definitions",
    difficulty: "beginner",
    duration: "12 min",
    summary: "CVA6's pipeline is held together by a set of packed structs defined in the top-level cva6.sv. Before understanding any module, you must understand these structs — they are the 'wires' that carry instructions and data between every stage.",
    body: `I have been building CPUs for 25 years, and the number one mistake I see students make when reading RTL for the first time is jumping straight into the module logic without understanding the data types flowing between modules. In CVA6, every stage communicates via a small set of packed structs. Master these, and the entire pipeline becomes readable.

WHAT IS A PACKED STRUCT IN SYSTEMVERILOG?
A packed struct is a group of signals treated as a single wide bus. When you see fetch_entry_t flowing from frontend to id_stage, that is one wide logic vector containing multiple named fields. The hardware doesn't know or care about the field names — it's just wires. But the RTL is human-readable because of those names.

THE FOUR CRITICAL STRUCTS (in pipeline order):

─────────────────────────────────────────────
1. fetch_entry_t — "What the frontend sends to decode"
─────────────────────────────────────────────
This is the bundle that travels from the frontend module to id_stage. It contains:
  • address: the PC (program counter) of this instruction — 64 bits (VLEN)
  • instruction: the raw 32-bit instruction word from the I-cache
  • branch_predict (branchpredict_sbe_t): the frontend's prediction — cf (control flow type: none/branch/jump/return) and predict_address (where we think we're going)
  • ex (exception_t): any exception that happened DURING fetch — page fault, access fault, misaligned PC

Notice what's NOT here: any decoded information. Decode hasn't run yet. This struct is purely: "here's the raw bytes we fetched, here's where we fetched them from, and here's what the branch predictor thinks."

─────────────────────────────────────────────
2. scoreboard_entry_t — "The instruction's identity card, used everywhere"
─────────────────────────────────────────────
This is THE most important struct in CVA6. Created by decode, it travels through issue, execute, and commit. Every pipeline stage reads or writes fields in this struct. Fields:

  • pc: instruction's program counter
  • trans_id: unique transaction ID for routing writeback results back to the correct scoreboard slot
  • fu (fu_t): which functional unit runs this — ALU, BU (branch), LSU, MULT, CSR, FPU
  • op (fu_op): the specific operation — ADD, SUB, LOAD, BRANCH_EQ, etc. (an enum of ~100 values)
  • rs1, rs2, rd: source and destination register addresses (5 bits each, for x0–x31)
  • result: dual-purpose field — before execution: holds the decoded immediate value; after execution: holds the computed result. Same bits, different meaning at different pipeline stages.
  • valid: has this instruction's result been computed yet?
  • use_imm: if true, use result field as operand B (immediate), not rs2
  • use_pc: if true, use PC as operand A (for AUIPC, JAL)
  • ex (exception_t): any exception detected during decode (illegal instruction, etc.)
  • bp (branchpredict_sbe_t): carried forward from fetch_entry_t for branch resolution comparison in EX stage
  • is_compressed: was this a 16-bit compressed instruction? Needed at commit to advance PC by +2 instead of +4

─────────────────────────────────────────────
3. fu_data_t — "What the execute stage actually receives"
─────────────────────────────────────────────
When the issue stage dispatches an instruction to a functional unit, it doesn't send the full scoreboard_entry_t. It sends a leaner fu_data_t with the resolved operand values:
  • fu: functional unit identifier
  • operation: the specific op enum value
  • operand_a: the actual value of rs1 (register file read or forwarded)
  • operand_b: the actual value of rs2 OR the immediate (already muxed by issue stage)
  • imm: the raw immediate (some FUs need both imm and operand_b separately)
  • trans_id: the scoreboard transaction ID to route the result back

This separation matters: scoreboard_entry_t holds addresses (rs1=5'b00101 means "register x5"), while fu_data_t holds values (operand_a=64'h0000000000000042 means "the value 66"). The issue stage does this translation.

─────────────────────────────────────────────
4. bp_resolve_t — "What the execute stage tells the frontend after a branch"
─────────────────────────────────────────────
After the branch unit computes the actual branch outcome, it sends bp_resolve_t back to the frontend:
  • valid: this resolution is meaningful (not all cycles have a resolving branch)
  • pc: the PC of the branch instruction that just resolved
  • target_address: where the branch actually goes (computed by BU)
  • is_mispredict: true if the frontend predicted differently
  • is_taken: actual direction
  • cf_type: what kind of control flow (branch, jump, return)

This is the critical feedback loop: if is_mispredict=1, the frontend flushes everything fetched after this branch and restarts from target_address. Without this struct, out-of-order speculation would be impossible to correct.

─────────────────────────────────────────────
5. exception_t — "Carried by everything, consumed only at commit"
─────────────────────────────────────────────
Almost every struct embeds an exception_t:
  • cause: the exception cause code (from RISC-V privileged spec — 12 = instruction page fault, 13 = load page fault, etc.)
  • tval: the "trap value" — for memory faults, the faulting address; for illegal instructions, the instruction word
  • valid: is this actually an exception?

The key design principle: exceptions are carried with the instruction through the pipeline. They are NOT acted upon immediately. A page fault during fetch is embedded in fetch_entry_t and carried forward. Decode sees it, passes it in scoreboard_entry_t, and the COMMIT stage is the first place that actually handles it. This ensures precise exceptions — by the time commit sees it, all older instructions have already committed.`,
    keySignals: [
      { name: "fetch_entry_t", direction: "struct", explanation: "Frontend→Decode interface. Contains: raw instruction word, PC, branch prediction, and any fetch exception. Created by frontend, consumed by id_stage." },
      { name: "scoreboard_entry_t", direction: "struct", explanation: "The CPU's universal instruction descriptor. Created by decode, lives in the scoreboard, updated by execute, committed by commit_stage. Every field serves a specific pipeline purpose." },
      { name: "fu_data_t", direction: "struct", explanation: "Scoreboard→Functional Unit interface. Contains resolved operand VALUES (not register addresses). The issue stage translates from addresses to values when it reads the register file." },
      { name: "bp_resolve_t", direction: "struct", explanation: "Execute→Frontend branch resolution. When a branch resolves in the EX stage, this struct carries the actual outcome back to the frontend for misprediction detection." },
      { name: "exception_t", direction: "struct", explanation: "Embedded in every pipeline struct. Carries exception information forward until commit_stage handles it. Enables precise exceptions without special pipeline paths." },
      { name: "writeback_t", direction: "struct", explanation: "Functional Unit→Scoreboard writeback. Contains: trans_id (which scoreboard entry to update), data (the result), ex_valid (exception from execution), valid (this writeback is meaningful)." }
    ],
    snippets: [
      {
        label: "cva6.sv — The 6 Core Structs (verbatim from ETH Zurich source)",
        language: "systemverilog",
        annotation: "These are defined as localparam types in the cva6.sv top-level. Every module receives them as parameter types — making CVA6 fully type-parameterized.",
        code: `// ── fetch_entry_t: Frontend → Decode ──────────────────────────────────────
localparam type fetch_entry_t = struct packed {
  logic [CVA6Cfg.VLEN-1:0] address;      // PC of this instruction
  logic [31:0]              instruction;  // Raw 32-bit instruction word (decompressed)
  branchpredict_sbe_t       branch_predict; // Frontend's prediction: cf_type + predict_address
  exception_t               ex;           // Fetch exception (page fault, misaligned)
};

// ── scoreboard_entry_t: Decode → Issue → Execute → Commit ─────────────────
localparam type scoreboard_entry_t = struct packed {
  logic [CVA6Cfg.VLEN-1:0]          pc;         // Instruction PC
  logic [CVA6Cfg.TRANS_ID_BITS-1:0] trans_id;   // Scoreboard slot ID
  fu_t                               fu;          // Which FU: ALU/BU/LSU/MULT/CSR/FPU
  fu_op                              op;          // Specific operation (ADD, LOAD, BEQ, ...)
  logic [REG_ADDR_SIZE-1:0]          rs1;         // Source reg 1 address (5-bit)
  logic [REG_ADDR_SIZE-1:0]          rs2;         // Source reg 2 address (5-bit)
  logic [REG_ADDR_SIZE-1:0]          rd;          // Destination reg address (5-bit)
  logic [CVA6Cfg.XLEN-1:0]          result;      // PRE-exec: immediate; POST-exec: result
  logic                              valid;        // Result has been written (exec done)
  logic                              use_imm;      // Use result field as operand B
  logic                              use_zimm;     // Use zero-extended imm as operand A
  logic                              use_pc;       // Use PC as operand A (AUIPC, JAL)
  exception_t                        ex;           // Exception (illegal instr, etc.)
  branchpredict_sbe_t                bp;           // Carried prediction for comparison in EX
  logic                              is_compressed;// C-ext: advance PC by +2, not +4 at commit
};

// ── fu_data_t: Issue → Functional Units ───────────────────────────────────
localparam type fu_data_t = struct packed {
  fu_t                               fu;          // Functional unit target
  fu_op                              operation;   // Specific operation
  logic [CVA6Cfg.XLEN-1:0]          operand_a;   // RESOLVED value of rs1 (or PC)
  logic [CVA6Cfg.XLEN-1:0]          operand_b;   // RESOLVED value of rs2 (or immediate)
  logic [CVA6Cfg.XLEN-1:0]          imm;         // Raw immediate (some FUs need this)
  logic [CVA6Cfg.TRANS_ID_BITS-1:0] trans_id;    // Scoreboard tag for writeback routing
};

// ── bp_resolve_t: Execute → Frontend (branch resolution) ──────────────────
localparam type bp_resolve_t = struct packed {
  logic                    valid;           // This resolution is meaningful
  logic [CVA6Cfg.VLEN-1:0] pc;             // PC of the resolving branch
  logic [CVA6Cfg.VLEN-1:0] target_address; // Actual jump target
  logic                    is_mispredict;  // Frontend was wrong
  logic                    is_taken;       // Branch actually taken?
  cf_t                     cf_type;        // BRANCH / JUMP / RETURN
};

// ── exception_t: embedded in every struct ─────────────────────────────────
parameter type exception_t = struct packed {
  logic [CVA6Cfg.XLEN-1:0]  cause;   // RISC-V exception cause code
  logic [CVA6Cfg.XLEN-1:0]  tval;    // Faulting addr / illegal instr word
  logic [CVA6Cfg.GPLEN-1:0] tval2;   // Guest physical addr (hypervisor)
  logic [31:0]               tinst;   // Transformed instruction (hypervisor)
  logic                      gva;     // Guest virtual address in tval
  logic                      valid;   // Is this actually an exception?
};`
      }
    ],
    designDecisions: [
      "CVA6 passes structs as parameter types (parameter type scoreboard_entry_t = logic) to every submodule. This makes the design fully type-parameterized — a 32-bit or 64-bit version of CVA6 uses different struct widths, but all module interfaces stay structurally identical.",
      "The scoreboard_entry_t.result field is reused: before execution it holds the decoded immediate; after execution it holds the computed result. This dual-use saves area (one 64-bit register instead of two) at the cost of careful documentation — you must always know which phase you're in when reading this field.",
      "trans_id is the scoreboard's tracking mechanism. When decode issues an instruction, it gets a trans_id (its scoreboard slot index). Every functional unit includes trans_id in its writeback. The scoreboard can find the correct entry in O(1) without searching by register address.",
      "exception_t is embedded in fetch_entry_t and scoreboard_entry_t (not a separate signal). This means no instruction ever needs a 'fast path' for exceptions — exceptions travel with the instruction, are checked at every stage, and are only handled at commit. Elegantly simple.",
      "branchpredict_sbe_t is carried from fetch_entry_t all the way into scoreboard_entry_t.bp. The branch unit in EX needs the original prediction to compute is_mispredict — it compares bp.predict_address with the actual computed target. Without carrying the prediction forward, you'd need a separate lookup table."
    ],
    relatedQuestions: ["l1-q1", "l1-q2", "l3-q1", "l2-q1"]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LESSON 1: FRONTEND
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "stage-01-frontend",
    stage: 1,
    category: "Frontend",
    title: "Stage 1 — Frontend: Fetch, Branch Prediction, and PC Control",
    subtitle: "CVA6 core/frontend/frontend.sv",
    difficulty: "beginner",
    duration: "11 min",
    summary: "The frontend is the CPU's first hardware. It generates the next PC, requests instructions from the I-cache, runs the branch predictor, and produces a stream of fetch_entry_t structs for decode. Every incorrect branch prediction traced back to a signal in this module.",
    body: `Let me walk you through what actually happens inside the frontend every clock cycle. This is the module that keeps the CPU fed with instructions — when it stalls, everything behind it stalls too.

EVERY CLOCK CYCLE, THE FRONTEND:

STEP 1 — SELECT THE NEXT PC
The PC selection mux is a priority chain. In order from highest to lowest priority:
  1. set_debug_pc_i: jump to debug ROM (only in debug mode)
  2. ex_valid_i: exception at commit — jump to trap_vector_base_i
  3. eret_i: return from exception handler — jump to epc_i
  4. set_pc_commit_i: CSR side-effect or fence — restart from pc_commit_i
  5. resolved_branch_i.is_mispredict: branch misprediction — jump to resolved_branch_i.target_address
  6. Branch predictor says taken: jump to predicted target
  7. Default: PC + 4 (or PC + 2 for compressed instruction)

Why this ordering? Higher-priority events are more "catastrophic" and must win. An exception invalidates everything. A branch misprediction invalidates only instructions after the branch. The default (PC+4) is the optimistic case — we assume sequential execution until told otherwise.

STEP 2 — ISSUE I-CACHE REQUEST
The selected PC is sent to the instruction cache as icache_dreq_o. The request struct carries:
  • req=1: we want a new instruction
  • vaddr: the virtual PC
  • kill_s1: kill the pipeline stage 1 of the I-cache (used on flush)
  • kill_s2: kill stage 2 (used on flush when previous request is in-flight)
  • spec: this is a speculative fetch (may be wrong if branch prediction is wrong)

The I-cache responds with icache_dreq_i. The response carries:
  • ready: cache can accept new requests
  • valid: the returned data is valid
  • data: the instruction word (FETCH_WIDTH bits — typically 64 bits to handle compressed instruction pairs)
  • ex: any exception that occurred (instruction page fault, access fault)

STEP 3 — BRANCH PREDICTION
Simultaneously with the I-cache request, the BHT (Branch History Table) and BTB (Branch Target Buffer) are queried using the current PC as the index. The BHT returns a taken/not-taken prediction. The BTB returns the predicted target address. If BHT says taken and BTB has a valid entry, the next PC comes from the BTB output (step 6 in the priority chain).

For return instructions (JALR targeting the link register), the RAS (Return Address Stack) provides the predicted return address. Every JAL/CALL pushes the return address onto the RAS; every RET pops it. The RAS is typically 8–16 entries deep.

STEP 4 — INSTRUCTION ALIGNMENT AND COMPRESSED HANDLING
RISC-V C extension allows 16-bit instructions. The I-cache returns FETCH_WIDTH bits (64 bits = 4 instructions' worth). The frontend must:
  • Identify which bytes are 16-bit vs 32-bit instructions (check bits [1:0]: 11 = 32-bit, anything else = compressed)
  • Decompress compressed instructions to their 32-bit equivalents
  • Handle the case where a 32-bit instruction crosses a cache-line boundary

STEP 5 — ISSUE TO DECODE VIA FETCH QUEUE
The frontend doesn't hand instructions directly to decode — there's a small FIFO between them (the "fetch queue" or instruction queue). This absorbs the I-cache latency variation: even if the I-cache takes 2 cycles to respond, decode can be fed from the queue. The fetch queue outputs fetch_entry_t structs with the fields we defined in Lesson 0.

WHAT CAUSES THE FRONTEND TO STALL?
  • I-cache miss: cache is busy fetching from L2 — frontend holds PC, no new request
  • Fetch queue full: decode is stalled (issue queue full, etc.) — backpressure reaches frontend
  • halt_i: WFI instruction or debug halt — frontend freezes

WHAT CAUSES A FRONTEND FLUSH?
  • flush_i: asserted by the controller on branch misprediction or exception. The frontend drops everything in-flight (I-cache requests are killed via kill_s1/kill_s2, fetch queue is drained), resets the PC to the correct value, and starts fresh next cycle.`,
    keySignals: [
      { name: "boot_addr_i", direction: "input", explanation: "The starting PC on reset. In CVA6, this is typically 0x80000000 (DRAM boot address) or defined by SoC parameters. The frontend's PC register resets to this value." },
      { name: "flush_i", direction: "input", explanation: "Full pipeline flush from the controller. On misprediction or exception. Kills in-flight I-cache requests (kill_s1, kill_s2), drains the fetch queue, and resets the PC to the redirect target." },
      { name: "resolved_branch_i (bp_resolve_t)", direction: "input", explanation: "Branch resolution from the EX stage. If is_mispredict=1, the frontend immediately redirects to target_address and asserts flush_i. This is the critical misprediction recovery path." },
      { name: "icache_dreq_o (icache_dreq_t)", direction: "output", explanation: "I-cache fetch request. The key fields: req=1 means 'I want an instruction here', vaddr=the virtual address, spec=1 means this is speculative (may be killed). kill_s1/kill_s2 abort in-flight requests on flush." },
      { name: "icache_dreq_i (icache_drsp_t)", direction: "input", explanation: "I-cache fetch response. valid=1 means instruction is ready, data contains FETCH_WIDTH bits (up to 4 instructions), ex.valid=1 means a page fault occurred during this fetch." },
      { name: "fetch_entry_o (fetch_entry_t[])", direction: "output", explanation: "The output to decode: an array of NrIssuePorts fetch_entry_t structs. Each contains one decoded instruction (possibly decompressed from C-ext) plus its prediction and any fetch exception." },
      { name: "fetch_entry_ready_i", direction: "input", explanation: "Backpressure from decode/issue. When deasserted, decode is telling the frontend 'I can't take more instructions right now'. Frontend holds fetch_entry_o valid but doesn't advance." }
    ],
    snippets: [
      {
        label: "frontend.sv — Full Module Port List (actual CVA6 source, ETH Zurich)",
        language: "systemverilog",
        annotation: "Every input to this module represents something that can redirect the PC. Read each one and ask: 'what event in the system causes this to fire?'",
        code: `// Copyright 2018 ETH Zurich and University of Bologna.
// Author: Florian Zaruba, ETH Zurich
// Description: Ariane Instruction Fetch Frontend

module frontend
  import ariane_pkg::*;
#(
    parameter config_pkg::cva6_cfg_t CVA6Cfg = config_pkg::cva6_cfg_empty,
    parameter type bp_resolve_t  = logic,
    parameter type fetch_entry_t = logic,
    parameter type icache_dreq_t = logic,
    parameter type icache_drsp_t = logic
) (
    input  logic                        clk_i,
    input  logic                        rst_ni,
    input  logic [CVA6Cfg.VLEN-1:0]     boot_addr_i,       // Reset PC

    // ── PC Redirection Inputs (priority: top = highest) ──────────────────
    input  logic                        flush_bp_i,         // Clear BHT/BTB speculation
    input  logic                        flush_i,            // Full flush: mispredict/exception
    input  logic                        halt_i,             // WFI / debug halt: stop fetching
    input  logic                        halt_frontend_i,    // Hold fetch for fence.i
    input  logic                        set_pc_commit_i,    // CSR side-effect: use commit PC
    input  logic [CVA6Cfg.VLEN-1:0]     pc_commit_i,        // PC to restart from after CSR
    input  logic                        ex_valid_i,         // Exception occurred at commit
    input  bp_resolve_t                 resolved_branch_i,  // ← Branch resolved in EX stage
    input  logic                        eret_i,             // Return from exception (MRET/SRET)
    input  logic [CVA6Cfg.VLEN-1:0]     epc_i,              // Exception return PC
    input  logic [CVA6Cfg.VLEN-1:0]     trap_vector_base_i, // Exception handler entry point
    input  logic                        set_debug_pc_i,     // Debug: jump to debug ROM
    input  logic                        debug_mode_i,       // CPU is in debug mode

    // ── I-Cache Interface ─────────────────────────────────────────────────
    output icache_dreq_t                icache_dreq_o,      // Fetch request → I-Cache
    input  icache_drsp_t                icache_dreq_i,      // Fetch response ← I-Cache

    // ── Output to Decode Stage (valid/ready handshake) ────────────────────
    // One entry per issue port; typically 1 or 2 depending on CVA6Cfg
    output fetch_entry_t [CVA6Cfg.NrIssuePorts-1:0] fetch_entry_o,
    output logic         [CVA6Cfg.NrIssuePorts-1:0] fetch_entry_valid_o,
    input  logic         [CVA6Cfg.NrIssuePorts-1:0] fetch_entry_ready_i  // Backpressure from decode
);`
      },
      {
        label: "bht.sv — Branch History Table: 2-bit Saturation Counter (actual CVA6 source)",
        language: "systemverilog",
        annotation: "This is the REAL branch predictor implementation from CVA6. Read how the saturation counter updates and how the prediction is driven directly from the MSB.",
        code: `// Copyright 2018-2019 ETH Zurich and University of Bologna.
// Source: core/frontend/bht.sv
// Branch History Table — 2-bit saturating counter, NR_ENTRIES entries

module bht #(
    parameter config_pkg::cva6_cfg_t CVA6Cfg = config_pkg::cva6_cfg_empty,
    parameter type bht_update_t      = logic,
    parameter int unsigned NR_ENTRIES = 1024
) (
    input  logic                        clk_i, rst_ni,
    input  logic                        flush_bp_i,    // clear all valid bits
    input  logic                        debug_mode_i,
    input  logic [CVA6Cfg.VLEN-1:0]    vpc_i,          // current fetch PC (index)
    input  bht_update_t                 bht_update_i,   // resolved branch from EX stage
    output ariane_pkg::bht_prediction_t [CVA6Cfg.INSTR_PER_FETCH-1:0] bht_prediction_o
);
  localparam OFFSET = CVA6Cfg.RVC ? 1 : 2; // skip LSB (always 0 for aligned instrs)
  localparam NR_ROWS = NR_ENTRIES / CVA6Cfg.INSTR_PER_FETCH;

  // ── The BHT storage: valid bit + 2-bit saturation counter per entry ──────
  struct packed {
    logic       valid;
    logic [1:0] saturation_counter; // 00=str not-taken, 01=wk not-taken,
  }                                 // 10=wk taken, 11=str taken
      bht_d[NR_ROWS-1:0][CVA6Cfg.INSTR_PER_FETCH-1:0],
      bht_q[NR_ROWS-1:0][CVA6Cfg.INSTR_PER_FETCH-1:0];

  logic [$clog2(NR_ROWS)-1:0] index, update_pc;
  assign index     = vpc_i[PREDICTION_BITS-1 : ROW_ADDR_BITS+OFFSET];
  assign update_pc = bht_update_i.pc[PREDICTION_BITS-1 : ROW_ADDR_BITS+OFFSET];

  // ── PREDICTION: MSB of saturation counter = taken/not-taken ──────────────
  for (genvar i = 0; i < CVA6Cfg.INSTR_PER_FETCH; i++) begin : gen_bht_output
    assign bht_prediction_o[i].valid = bht_q[index][i].valid;
    assign bht_prediction_o[i].taken = bht_q[index][i].saturation_counter[1]; // MSB!
  end

  // ── UPDATE: saturating increment/decrement on branch resolution ──────────
  always_comb begin : update_bht
    bht_d = bht_q;
    logic [1:0] sat = bht_q[update_pc][update_row_index].saturation_counter;

    if (bht_update_i.valid && !debug_mode_i) begin
      bht_d[update_pc][update_row_index].valid = 1'b1;

      if (sat == 2'b11) begin          // Strongly taken — only decrement
        if (!bht_update_i.taken)
          bht_d[update_pc][update_row_index].saturation_counter = sat - 1;
      end else if (sat == 2'b00) begin // Strongly not-taken — only increment
        if (bht_update_i.taken)
          bht_d[update_pc][update_row_index].saturation_counter = sat + 1;
      end else begin                   // Middle states: move toward outcome
        if (bht_update_i.taken)
          bht_d[update_pc][update_row_index].saturation_counter = sat + 1;
        else
          bht_d[update_pc][update_row_index].saturation_counter = sat - 1;
      end
    end
  end

  // ── FLUSH: clear all valid bits (on fence.i or full flush) ───────────────
  always_ff @(posedge clk_i or negedge rst_ni) begin
    if (!rst_ni || flush_bp_i) begin
      for (int i = 0; i < NR_ROWS; i++)
        for (int j = 0; j < CVA6Cfg.INSTR_PER_FETCH; j++)
          bht_q[i][j] <= '{valid: 1'b0, saturation_counter: 2'b00};
    end else begin
      bht_q <= bht_d;
    end
  end
endmodule`
      }
    ],
    designDecisions: [
      "The two-stage I-cache kill (kill_s1, kill_s2) is not an accident. CVA6's instruction cache is pipelined: stage 1 does the virtual address index lookup, stage 2 does the tag compare and data read. A flush must kill BOTH stages or you'll get a stale response arriving one cycle after the flush and corrupting the instruction stream.",
      "halt_frontend_i is distinct from halt_i. fence.i requires: (1) drain the pipeline, (2) flush the I-cache, (3) restart. During step 2, the frontend must not issue new fetch requests (halt_frontend_i=1), but the backend can continue committing the last few instructions (halt_i=0 until fully drained). Two signals, two different behaviors.",
      "The fetch queue FIFO between I-cache and decode is essential for performance. Without it, every I-cache miss stalls decode directly. With it, decode can continue consuming queued instructions while the cache serves a miss. CVA6's fetch queue is ~4 entries deep.",
      "resolved_branch_i carries pc (the branch's own PC) alongside is_mispredict. Why? The frontend must update the BHT and BTB regardless of whether it was a misprediction. The pc field indexes the BHT entry to update. A correctly-predicted branch still needs its 2-bit counter incremented.",
      "spec=1 in icache_dreq_t marks the fetch as speculative. This allows the I-cache to make different policy decisions (e.g., not installing speculative fetches into the I-cache prefetch buffer). In CVA6's base implementation, all fetches are speculative and the cache treats them identically — but the field exists for future optimizations."
    ],
    relatedQuestions: ["l3-q2", "l2-q1", "l1-q5", "l1-q6"]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LESSON 2: DECODE (ID STAGE)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "stage-02-decode",
    stage: 2,
    category: "Decode",
    title: "Stage 2 — id_stage: Cracking the Instruction Word",
    subtitle: "CVA6 core/id_stage.sv + core/decoder.sv",
    difficulty: "beginner",
    duration: "10 min",
    summary: "The id_stage takes fetch_entry_t from the frontend and produces scoreboard_entry_t for the issue stage. It's where bit patterns become operations, where register addresses are extracted, and where illegal instructions become exceptions.",
    body: `The decode stage is conceptually simple but architecturally critical. Every instruction in the CPU is a 32-bit number that must be decoded into a structured scoreboard_entry_t. Let me explain exactly how this happens in CVA6.

WHAT id_stage.sv ACTUALLY DOES:

id_stage.sv is a thin wrapper. The actual bit-pattern decoding is in decoder.sv — id_stage handles the handshaking, interrupt injection, and operand reading. Here's the flow:

STEP 1 — CONSUME FROM FRONTEND
fetch_entry_valid_i tells id_stage that fetch_entry_i holds valid instruction(s). id_stage asserts fetch_entry_ready_o when it can consume them. This ready/valid handshake is the standard CVA6 inter-stage protocol. If the issue stage's scoreboard is full, id_stage deasserts ready, which backs up to the frontend.

STEP 2 — THE DECODER (decoder.sv)
Inside id_stage, the decoder sub-module does the actual decoding. It's a giant combinational block (pure logic, no registers). Given instruction[31:0], it produces:
  • fu: which functional unit (determined by opcode)
  • op: which specific operation (determined by opcode + funct3 + funct7)
  • rs1, rs2, rd: extracted directly from fixed bit positions
    — rs1 = instruction[19:15]
    — rs2 = instruction[24:20]
    — rd  = instruction[11:7]
  • immediate: assembled from scattered bits (RISC-V's 6 immediate formats)
  • is_control_flow: is this a branch or jump?
  • illegal_instr: no valid encoding matched — this is an exception

The immediate extraction is where most students struggle. RISC-V encodes immediates with bits in non-contiguous positions to minimize the number of mux inputs to the register file read stage. There are 6 formats:
  • I-type:  imm = {inst[31:20]}  — 12-bit signed
  • S-type:  imm = {inst[31:25], inst[11:7]}  — 12-bit signed (split around rs2)
  • B-type:  imm = {inst[31], inst[7], inst[30:25], inst[11:8], 1'b0} — 13-bit, PC-relative, always even
  • U-type:  imm = {inst[31:12], 12'b0}  — 20-bit upper
  • J-type:  imm = {inst[31], inst[19:12], inst[20], inst[30:21], 1'b0} — 21-bit, PC-relative, always even
  • CSR:     imm = {27'b0, inst[19:15]}  — zero-extended 5-bit zimm

STEP 3 — COMPRESSED INSTRUCTION EXPANSION
If CVA6 is built with C-extension support (which it is by default), id_stage includes a compressed decoder. 16-bit instructions are expanded to their 32-bit RISC-V equivalents before passing to the main decoder. Example: C.ADD (16-bit) → ADD rd, rd, rs2 (32-bit). There is a 1:1 mapping for every C.* instruction.

STEP 4 — INTERRUPT INJECTION
This is subtle and important. id_stage checks irq_ctrl_i every cycle. If an interrupt is pending AND enabled AND the CPU is not already in a higher-privilege exception handler, id_stage injects a special interrupt scoreboard_entry_t with ex.valid=1 and the interrupt cause code. This instruction has no real operation — it just carries the exception through the pipeline to commit, where the exception handler redirect happens. Why here? RISC-V says interrupts are taken at instruction boundaries — the instruction boundary is the point between decode and issue.

STEP 5 — OUTPUT TO ISSUE
The completed scoreboard_entry_t (with pc, trans_id not yet assigned, fu, op, rs1, rs2, rd, immediate in result field, use_imm, ex, bp, is_compressed) is handed to the issue stage via issue_entry_o with issue_entry_valid_o.

THE SCOREBOARD_ENTRY_T.RESULT FIELD AT THIS POINT
After decode, the result field holds the IMMEDIATE VALUE. For an instruction like ADDI x5, x6, 42, result = 64'd42, use_imm = 1. The issue stage will use result as operand_b directly, bypassing the rs2 register file read. For register-register instructions, result = 0 initially and use_imm = 0 — result will be overwritten by the functional unit with the actual computed value.`,
    keySignals: [
      { name: "fetch_entry_i (fetch_entry_t[])", direction: "input", explanation: "From frontend: raw instruction word, PC, branch prediction, fetch exception. id_stage consumes this and converts it into a scoreboard_entry_t." },
      { name: "fetch_entry_ready_o", direction: "output", explanation: "Backpressure to frontend. Deasserted when: (1) scoreboard is full, (2) a structural hazard prevents issue, (3) a CSR instruction is serializing the pipeline." },
      { name: "issue_entry_o (scoreboard_entry_t[])", direction: "output", explanation: "The decoded instruction descriptor. Fields populated: pc, fu, op, rs1, rs2, rd, result(=immediate), use_imm, ex, bp, is_compressed. trans_id is assigned by the scoreboard, not decode." },
      { name: "irq_ctrl_i (irq_ctrl_t)", direction: "input", explanation: "Current interrupt enable/pending state from the CSR file. id_stage checks this every cycle to decide if an interrupt should be injected as a special exception instruction." },
      { name: "tvm_i / tw_i / tsr_i", direction: "input", explanation: "Trap Virtual Memory, Timeout Wait, Trap SRET — S-mode virtualization bits from mstatus CSR. id_stage checks these to determine if certain instructions (SFENCE.VMA, WFI, SRET) should trap." }
    ],
    snippets: [
      {
        label: "id_stage.sv — Module Port List (actual CVA6 source)",
        language: "systemverilog",
        annotation: "Notice the upstream (frontend) and downstream (issue) handshake are symmetric: valid/ready in both directions. This is CVA6's standard inter-stage protocol.",
        code: `// Copyright 2018 ETH Zurich and University of Bologna.
// Author: Florian Zaruba, ETH Zurich
// Description: Instruction decode, issue and operand read.

module id_stage #(
    parameter config_pkg::cva6_cfg_t CVA6Cfg  = config_pkg::cva6_cfg_empty,
    parameter type branchpredict_sbe_t         = logic,
    parameter type exception_t                 = logic,
    parameter type fetch_entry_t               = logic,   // ← INPUT type
    parameter type scoreboard_entry_t          = logic,   // ← OUTPUT type
    parameter type irq_ctrl_t                  = logic
) (
    input  logic   clk_i,
    input  logic   rst_ni,
    input  logic   flush_i,       // Squash instruction being decoded
    input  logic   debug_req_i,   // Debug: may redirect to debug ROM

    // ── Upstream: from Frontend (valid/ready) ────────────────────────────
    input  fetch_entry_t [CVA6Cfg.NrIssuePorts-1:0] fetch_entry_i,
    input  logic         [CVA6Cfg.NrIssuePorts-1:0] fetch_entry_valid_i,
    output logic         [CVA6Cfg.NrIssuePorts-1:0] fetch_entry_ready_o, // backpressure

    // ── Downstream: to Issue Stage / Scoreboard (valid/ready) ────────────
    output scoreboard_entry_t [CVA6Cfg.NrIssuePorts-1:0] issue_entry_o,
    output logic              [CVA6Cfg.NrIssuePorts-1:0] issue_entry_valid_o,
    output logic              [CVA6Cfg.NrIssuePorts-1:0] is_ctrl_flow_o,   // is branch/jump?
    input  logic              [CVA6Cfg.NrIssuePorts-1:0] issue_instr_ack_i,// issue consumed it

    // ── Interrupt control from CSR file ──────────────────────────────────
    input  irq_ctrl_t  irq_ctrl_i,   // mie, mip, mideleg, global_enable
    input  logic       tvm_i,         // Trap Virtual Memory (S-mode trap)
    input  logic       tw_i,          // Timeout Wait (WFI trap)
    input  logic       tsr_i          // Trap SRET
);`
      },
      {
        label: "decoder.sv — Immediate Extraction + Opcode Decode (real CVA6 logic)",
        language: "systemverilog",
        annotation: "Real decoder.sv logic: immediate extraction + opcode→fu/op mapping. This entire block is combinational — no registers.",
        code: `// From CVA6 core/decoder.sv — Florian Zaruba, ETH Zurich
// This is the core of the decoder: maps instruction bits → scoreboard_entry_t

// ── Register address extraction (fixed bit positions in all RISC-V formats) ──
assign instruction_o.rs1 = instr.rtype.rs1;   // [19:15]
assign instruction_o.rs2 = instr.rtype.rs2;   // [24:20]
assign instruction_o.rd  = instr.rtype.rd;    // [11:7]

// ── Immediate extraction — 6 formats, assembled from scattered bits ──────────
logic [63:0] imm_i_type, imm_s_type, imm_b_type, imm_u_type, imm_j_type, imm_z_type;
assign imm_i_type = {{52{instruction_i[31]}}, instruction_i[31:20]};
assign imm_s_type = {{52{instruction_i[31]}}, instruction_i[31:25], instruction_i[11:7]};
assign imm_b_type = {{51{instruction_i[31]}}, instruction_i[31],    instruction_i[7],
                       instruction_i[30:25],   instruction_i[11:8],  1'b0};
assign imm_u_type = {{32{instruction_i[31]}}, instruction_i[31:12], 12'b0};
assign imm_j_type = {{43{instruction_i[31]}}, instruction_i[31],    instruction_i[19:12],
                       instruction_i[20],      instruction_i[30:21], 1'b0};
assign imm_z_type = {59'b0, instruction_i[19:15]}; // CSR zimm: zero-ext 5-bit

// ── Opcode decode: instruction[6:0] selects format + functional unit ─────────
always_comb begin : decode
  instruction_o.fu      = NONE;
  instruction_o.op      = ADD;
  instruction_o.result  = 64'b0;  // will hold immediate
  instruction_o.use_imm = 1'b0;
  illegal_instr         = 1'b0;

  unique case (instruction_i[6:0])  // opcode field

    riscv::OpcodeLoad: begin           // LOAD: LB, LH, LW, LD, LBU, LHU, LWU
      instruction_o.fu      = LOAD;
      instruction_o.result  = imm_i_type;   // base + offset
      instruction_o.use_imm = 1'b1;
      unique case (instruction_i[14:12]) // funct3
        3'b000: instruction_o.op = LB;   3'b001: instruction_o.op = LH;
        3'b010: instruction_o.op = LW;   3'b011: instruction_o.op = LD;
        3'b100: instruction_o.op = LBU;  3'b101: instruction_o.op = LHU;
        3'b110: instruction_o.op = LWU;
        default: illegal_instr = 1'b1;
      endcase
    end

    riscv::OpcodeStore: begin          // STORE: SB, SH, SW, SD
      instruction_o.fu      = STORE;
      instruction_o.result  = imm_s_type;   // base + offset
      instruction_o.use_imm = 1'b1;
      unique case (instruction_i[14:12])
        3'b000: instruction_o.op = SB;  3'b001: instruction_o.op = SH;
        3'b010: instruction_o.op = SW;  3'b011: instruction_o.op = SD;
        default: illegal_instr = 1'b1;
      endcase
    end

    riscv::OpcodeRegImm: begin         // I-type ALU: ADDI, SLTI, ANDI, ORI, XORI...
      instruction_o.fu      = ALU;
      instruction_o.result  = imm_i_type;
      instruction_o.use_imm = 1'b1;
      unique case (instruction_i[14:12])
        3'b000: instruction_o.op = ADD;   // ADDI
        3'b010: instruction_o.op = SLTS;  // SLTI
        3'b011: instruction_o.op = SLTU;  // SLTIU
        3'b100: instruction_o.op = XORL;  // XORI
        3'b110: instruction_o.op = ORL;   // ORI
        3'b111: instruction_o.op = ANDL;  // ANDI
        // shifts use funct7 to distinguish SLL/SRL/SRA
        3'b001: instruction_o.op = SLL;
        3'b101: instruction_o.op = (instruction_i[30]) ? SRA : SRL;
        default: illegal_instr = 1'b1;
      endcase
    end

    riscv::OpcodeBranch: begin         // B-type: BEQ, BNE, BLT, BGE, BLTU, BGEU
      instruction_o.fu     = CTRL_FLOW;
      instruction_o.result = imm_b_type;  // branch target offset
      unique case (instruction_i[14:12])
        3'b000: instruction_o.op = EQ;   3'b001: instruction_o.op = NE;
        3'b100: instruction_o.op = LTS;  3'b101: instruction_o.op = GES;
        3'b110: instruction_o.op = LTU;  3'b111: instruction_o.op = GEU;
        default: illegal_instr = 1'b1;
      endcase
    end

    // ... JAL, JALR, LUI, AUIPC, R-type, CSR, FENCE, SYSTEM omitted for space
    default: illegal_instr = 1'b1;
  endcase
end`
      }
    ],
    designDecisions: [
      "id_stage instantiates one decoder.sv per issue port. In 2-wide CVA6, there are two decoder instances running in parallel — both decode their respective instructions in the same cycle. The scoreboard entry arrays have NrIssuePorts entries for exactly this reason.",
      "is_ctrl_flow_o is a separate output, not a field in scoreboard_entry_t. The frontend needs to know IMMEDIATELY (same cycle) if the instruction being decoded is a branch or jump, so it can update the BHT. Putting it in scoreboard_entry_t would add one cycle of latency to BHT updates.",
      "Interrupt injection at decode (not commit) is intentional. If we injected at commit, the interrupt latency would include all the in-flight instructions draining through execute — potentially hundreds of cycles. By injecting at decode, the interrupt exception follows normal pipeline flow and reaches commit in ~5 cycles.",
      "The tvm_i/tw_i/tsr_i inputs directly affect decode behavior: SFENCE.VMA with tvm=1 becomes an illegal instruction trap, WFI with tw=1 becomes a trap, SRET with tsr=1 becomes a trap. These are S-mode virtualization features (used by hypervisors to trap certain privileged operations).",
      "The decoder is purely combinational. There are no registers inside decoder.sv — the entire 32-bit → scoreboard_entry_t translation happens in one cycle, as one huge cascade of logic. This is why decode is never the pipeline bottleneck: it's a single logic level between two pipeline registers."
    ],
    relatedQuestions: ["l1-q2", "l1-q3", "l1-q6", "l1-q7", "l1-q8"]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LESSON 3: ISSUE STAGE + SCOREBOARD
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "stage-03-issue",
    stage: 3,
    category: "Issue & Scoreboard",
    title: "Stage 3 — Issue Stage: The Scoreboard and Out-of-Order Dispatch",
    subtitle: "CVA6 core/issue_stage.sv + core/scoreboard.sv",
    difficulty: "intermediate",
    duration: "13 min",
    summary: "The issue stage manages the scoreboard, reads register file operands, handles all forwarding, and dispatches instructions to functional units when their operands are ready. This is where in-order flow meets out-of-order execution.",
    body: `The issue stage is the most complex part of CVA6. It bridges two worlds: instructions arrive from decode in program order, but they can be dispatched to functional units out of order. The scoreboard is the data structure that makes this safe.

UNDERSTANDING THE CVA6 SCOREBOARD:

The scoreboard is a fixed-size circular buffer with NR_SB_ENTRIES slots (typically 8–16 entries depending on configuration). Each slot holds one scoreboard_entry_t plus a "valid" bit. The scoreboard has two pointers:
  • issue_pointer: where the next new instruction will be placed (tail)
  • commit_pointer: the oldest in-flight instruction (head)

When decode sends a new instruction, the scoreboard allocates the next slot at issue_pointer, assigns trans_id = issue_pointer, and advances issue_pointer. When commit acknowledges an instruction, commit_pointer advances.

THE ALLOCATION STEP:
At allocation, the scoreboard writes the scoreboard_entry_t from decode into the slot. The result field still holds the immediate (not the real result). valid=0 (result not yet computed). issued=0 (not yet sent to functional unit).

THE ISSUE STEP — THE COMPLEX PART:
Every cycle, the scoreboard scans its entries to find instructions that are:
  1. Not yet issued (issued=0)
  2. Have all operands available (no pending RAW dependency)
  3. The target functional unit is free (not busy)

How does it check for RAW dependencies? It scans all issued-but-not-complete entries for any whose rd matches rs1 or rs2 of the candidate instruction. If a match is found AND that entry's valid bit is 0 (result not yet available), the candidate must wait.

CVA6 also checks for structural hazards: if the ALU is busy (two ALU instructions in a 2-wide issue), no third ALU instruction can issue. If the LSU has a pending store that hasn't completed, load instructions that might alias must wait.

REGISTER FILE READ AND FORWARDING:
When an instruction is ready to issue, the scoreboard reads rs1 and rs2 from the register file. But it also checks the forwarding network:
  1. Is there a writeback happening this cycle (from a functional unit) that matches rs1? Use that value.
  2. Is there a completed entry in the scoreboard (valid=1) whose rd matches rs1? Use that value.
  3. Otherwise: use register file value.

The forwarded values become operand_a and operand_b in the fu_data_t sent to the functional unit. This is the critical translation: from register ADDRESSES (rs1=5) to register VALUES (operand_a = 0x42).

THE DISPATCH STEP:
Once operands are resolved, the scoreboard sends fu_data_t to the appropriate functional unit via the valid/ready interface. The functional unit asserts ready when it can accept work. On the handshake (valid AND ready), the instruction is considered issued (issued=1).

WRITEBACK:
When a functional unit completes, it sends a writeback_t on the writeback bus: trans_id (which scoreboard slot), data (the result), ex_valid (did an exception occur?), valid (this writeback is real). The scoreboard finds the matching slot using trans_id and writes: result = data, valid = 1 (or ex.valid = 1 if exception). Now this instruction is eligible for commit.

COMMIT INTERFACE:
The scoreboard exposes its oldest committed-but-not-acked instruction as commit_instr_o[0], commit_instr_o[1] (for 2-wide commit). The commit stage checks these, performs the register write and store drain, then asserts commit_ack_o. The scoreboard advances commit_pointer.

WHY THIS IS NOT FULL TOMASULO:
CVA6's scoreboard is simpler than Tomasulo's reservation stations. Tomasulo tags individual reservation station entries; CVA6 tags scoreboard slots (which is the trans_id). More importantly, CVA6 does a RAW check at issue time by scanning the scoreboard — this is conservative. It may stall unnecessarily if two instructions happen to use the same register number but aren't actually dependent (this can't happen for RAW, but WAR and WAW are non-issues here since CVA6 doesn't rename registers). The tradeoff: simpler hardware, slightly less ILP extraction than a full OoO machine with register renaming.`,
    keySignals: [
      { name: "issue_entry_i (scoreboard_entry_t[])", direction: "input", explanation: "Decoded instructions from id_stage. The scoreboard allocates a slot and assigns trans_id when it accepts this." },
      { name: "rs1_forwarding_o / rs2_forwarding_o", direction: "output", explanation: "The RESOLVED operand values sent to the execute stage. These are either register file values or forwarded from the writeback buses. This translation from address→value happens here." },
      { name: "fu_data_o (fu_data_t[])", direction: "output", explanation: "The dispatch bundle to functional units. Contains resolved operand values, operation, and trans_id. One per issue port." },
      { name: "commit_instr_o (scoreboard_entry_t[])", direction: "output", explanation: "The NrCommitPorts oldest instructions, presented to the commit stage. Only presented when valid=1 (execution complete). commit_stage checks for exceptions and performs the register write." },
      { name: "commit_ack_i", direction: "input", explanation: "Commit stage's acknowledgment. When asserted for port N, the scoreboard frees that slot and advances commit_pointer." },
      { name: "wb_valid_i / wb_trans_id_i / wb_result_i", direction: "input", explanation: "Writeback bus from all functional units. When a FU completes, it broadcasts here. Scoreboard matches trans_id to update the correct entry's result and valid bit." }
    ],
    snippets: [
      {
        label: "scoreboard.sv — Internal FIFO struct + writeback logic (actual CVA6 source)",
        language: "systemverilog",
        annotation: "The REAL scoreboard internal struct from ETH Zurich. Note: 'issued' tracks dispatch, 'cancelled' handles squash, sbe.valid tracks result completion.",
        code: `// Copyright 2018 ETH Zurich and University of Bologna.
// Source: core/scoreboard.sv — Florian Zaruba

// ── THE INTERNAL SCOREBOARD FIFO ENTRY (actual typedef from scoreboard.sv) ──
typedef struct packed {
  logic             issued;    // instruction was dispatched to a functional unit
  logic             cancelled; // squashed (on mispredicted branch path)
  scoreboard_entry_t sbe;      // the full decoded instruction
                               // sbe.valid = result computed; sbe.result = value
} sb_mem_t;

sb_mem_t [CVA6Cfg.NR_SB_ENTRIES-1:0] mem_q, mem_n; // the scoreboard table

// Pointers
logic [$clog2(CVA6Cfg.NR_SB_ENTRIES)-1:0] issue_cnt_n, issue_cnt_q;   // tail (decode side)
logic [$clog2(CVA6Cfg.NR_SB_ENTRIES)-1:0] commit_pointer_n, commit_pointer_q; // head

// ── ALLOCATION from decode stage ─────────────────────────────────────────────
// When decode presents a valid instruction and scoreboard has space:
for (genvar i = 0; i < CVA6Cfg.NrIssuePorts; i++) begin
  if (decoded_instr_valid_i[i] && decoded_instr_ack_o[i]) begin
    mem_n[issue_cnt_n].sbe          = decoded_instr_i[i];
    mem_n[issue_cnt_n].sbe.trans_id = issue_cnt_n; // slot index IS the trans_id
    mem_n[issue_cnt_n].sbe.valid    = 1'b0;        // result not ready yet
    mem_n[issue_cnt_n].issued       = 1'b0;        // not yet dispatched to FU
    mem_n[issue_cnt_n].cancelled    = 1'b0;
  end
end

// ── WRITEBACK from functional units (NrWbPorts buses, checked every cycle) ───
// Each FU broadcasts: trans_id + result + exception
for (genvar i = 0; i < CVA6Cfg.NrWbPorts; i++) begin
  if (wt_valid_i[i]) begin
    // Direct index using trans_id — O(1), no search needed
    mem_n[trans_id_i[i]].sbe.result = wbdata_i[i];   // write result
    mem_n[trans_id_i[i]].sbe.valid  = 1'b1;           // mark complete
    if (ex_i[i].valid)
      mem_n[trans_id_i[i]].sbe.ex  = ex_i[i];         // capture exception
  end
end

// ── BRANCH MISPREDICTION: cancel all entries after the branch ────────────────
if (resolved_branch_i.is_mispredict) begin
  for (int i = 0; i < CVA6Cfg.NR_SB_ENTRIES; i++) begin
    // Cancel every entry that was issued AFTER the mispredicted branch
    // (identified by comparing trans_id ordering)
    if (/* entry is younger than branch */ ...)
      mem_n[i].cancelled = 1'b1;
  end
end

// ── COMMIT INTERFACE: expose head entries to commit_stage ────────────────────
for (genvar i = 0; i < CVA6Cfg.NrCommitPorts; i++) begin
  assign commit_instr_o[i] = mem_q[(commit_pointer_q + i)].sbe;
  // commit_drop_o: tell commit_stage this entry was cancelled (squash path)
  assign commit_drop_o[i]  = mem_q[(commit_pointer_q + i)].cancelled;
end

// Advance commit pointer when commit stage acks
always_ff @(posedge clk_i or negedge rst_ni) begin
  if (!rst_ni || flush_i) begin
    mem_q           <= '0;
    commit_pointer_q <= '0;
    issue_cnt_q      <= '0;
  end else begin
    mem_q            <= mem_n;
    commit_pointer_q <= commit_pointer_n;
    issue_cnt_q      <= issue_cnt_n;
  end
end`
      }
    ],
    designDecisions: [
      "trans_id = issue_pointer at allocation time. This is elegant: the scoreboard slot index IS the transaction ID. The functional unit stores this 4-bit number and returns it at writeback — the scoreboard can update the correct slot in a single cycle without any search, just indexing into the array.",
      "CVA6 does NOT rename registers. This means WAW (write-after-write) and WAR (write-after-read) hazards are handled conservatively — the scoreboard stalls any instruction that reads a register with a pending write. A full OoO machine with register renaming (like BOOM or any modern x86 core) would allow these to proceed. CVA6 trades ILP for simplicity.",
      "The multiple writeback buses (NR_WB_PORTS) exist because different functional units complete at different times. The ALU completes in 1 cycle, MUL in 3, DIV in 32, LSU in 2–200+ cycles. Having one bus per functional unit means they never contend — no bus arbitration needed. The scoreboard's generate block checks all buses every cycle.",
      "sbe.valid=1 means the result is computed AND ready for commit. The scoreboard doesn't distinguish between 'issued to FU' and 'result valid' using this bit alone — it uses the issued field for the former. The sbe.valid bit is set only by the writeback path, not by dispatch.",
      "The commit interface exposes NrCommitPorts entries simultaneously (typically 2). The commit stage can retire up to 2 instructions per cycle if both head entries are valid and clean (no exceptions). This is the peak commit bandwidth of CVA6."
    ],
    relatedQuestions: ["l3-q1", "l2-q1", "l3-q5", "l1-q3", "l1-q4"]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LESSON 4: EXECUTE STAGE
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "stage-04-execute",
    stage: 4,
    category: "Execute",
    title: "Stage 4 — ex_stage: ALU, Branch Unit, and Load-Store Unit",
    subtitle: "CVA6 core/ex_stage.sv",
    difficulty: "intermediate",
    duration: "12 min",
    summary: "ex_stage.sv is the orchestrator of all functional units. Instructions dispatched by the issue stage arrive here, fan out to the correct unit, execute, and send results back via writeback buses. The branch unit sends bp_resolve_t back to the frontend — this is the misprediction recovery path.",
    body: `The execute stage is where instructions actually do work. ex_stage.sv doesn't contain the computation logic itself — it instantiates the functional units and routes signals between them and the issue/scoreboard stage.

THE FUNCTIONAL UNITS IN CVA6:

ALU (alu.sv):
Handles: ADD, SUB, AND, OR, XOR, SLL, SRL, SRA, SLT, SLTU, LUI, AUIPC, and the compare operations for branch conditions.
Latency: 1 cycle (combinational in CVA6's base implementation — no pipeline registers inside the ALU).
Key design: the ALU result goes to TWO places simultaneously: (1) the writeback bus back to the scoreboard, and (2) alu_result_ex_id_o — a direct forwarding path to the issue stage for back-to-back ALU instruction forwarding. This is the fastest forwarding path in the CPU.

Branch Unit (branch_unit.sv):
Handles: BEQ, BNE, BLT, BGE, BLTU, BGEU, JAL, JALR.
Latency: 1 cycle.
What it does:
  1. Evaluates the branch condition using the ALU's compare logic (operand_a - operand_b, check sign/zero flags)
  2. Computes the actual target PC: PC + B-type immediate (for branches) or rs1 + I-type immediate (for JALR)
  3. Compares actual target with bp.predict_address from the scoreboard_entry_t
  4. If mismatch OR prediction was not-taken but branch IS taken → is_mispredict=1
  5. Sends bp_resolve_t to the frontend with: pc (branch's PC), target_address (actual), is_mispredict, is_taken
The is_mispredict signal propagates to the controller, which asserts flush_i to the frontend and squashes all younger instructions from the scoreboard.

Load-Store Unit (lsu.sv → load_unit.sv + store_unit.sv):
Handles: all LOAD and STORE instructions.
Latency: variable. Best case 3 cycles (1 AGU + 1 TLB + 1 D-cache hit). Worst case: hundreds of cycles on a last-level cache miss.
Internal pipeline:
  1. AGU (Address Generation Unit): address = operand_a + sign_extend(immediate). Runs in parallel with the TLB.
  2. TLB Lookup: translate virtual address → physical address. On TLB miss, the PTW (Page Table Walker) takes over — may take 10–50+ cycles.
  3. D-Cache Access: indexed by [physical_address[index_bits-1:0]], tagged by [physical_address[tag_bits-1:0]]. On hit: data available next cycle. On miss: L2 fetch.
  4. Data Alignment: for byte/halfword loads, extract the correct bytes from the 64-bit cache line and sign-extend.
  5. Store Buffer: stores are NOT written to cache immediately. They go into a store buffer and wait for commit. This ensures speculative stores don't corrupt memory.

The LSU's store_unit.sv and load_unit.sv run independently. Loads can bypass stores (store-to-load forwarding) if the store's address and data are known and match the load address.

Multiply-Divide Unit (mult.sv):
Handles: MUL, MULH, MULHSU, MULHU, DIV, DIVU, REM, REMU.
Latency: MUL = 2-3 cycles (configurable). DIV/REM = 32-64 cycles (iterative restoring division).
This unit stalls the issue stage via the ready signal while dividing.

CSR Unit (csr_regfile.sv — called from commit_stage, not ex_stage directly):
CSR instructions (CSRRW, CSRRS, CSRRC, ECALL, EBREAK, MRET, SRET, WFI, FENCE) are partially decoded in decode and dispatched to ex_stage, but CSR reads/writes happen at commit_stage to serialize correctly with exception handling.

THE WRITEBACK BUSES:
Each functional unit has its own writeback bus. The scoreboard in issue_stage monitors ALL writeback buses simultaneously. When unit ALU-0 completes instruction with trans_id=3, it asserts wbdata_o[ALU0_PORT].valid=1, wbdata_o[ALU0_PORT].trans_id=3, wbdata_o[ALU0_PORT].data=result. The scoreboard sees this and marks mem[3].sbe.valid=1, mem[3].sbe.result=result.`,
    keySignals: [
      { name: "fu_data_i (fu_data_t[])", direction: "input", explanation: "From issue stage: resolved operand values, operation, trans_id. This is what each functional unit receives to do its computation." },
      { name: "alu_valid_i / alu_ready_o", direction: "input/output", explanation: "Valid/ready handshake for ALU dispatch. alu_valid_i asserted by issue when an ALU instruction is ready. alu_ready_o deasserted when the ALU is busy (only relevant in pipelined ALU configurations)." },
      { name: "resolved_branch_o (bp_resolve_t)", direction: "output", explanation: "Branch resolution result to the frontend. The most critical output: if is_mispredict=1, the frontend will flush and redirect. Goes to frontend AND the controller AND the scoreboard for squash." },
      { name: "alu_result_ex_id_o", direction: "output", explanation: "Direct forwarding path: ALU result goes back to the issue stage without going through the scoreboard writeback. Enables ALU→ALU forwarding in 1 cycle (issue can dispatch the next instruction using this result without waiting for the scoreboard to update)." },
      { name: "dcache_req_ports_o (dcache_req_i_t[3])", direction: "output", explanation: "Three D-cache ports from the LSU: port 0 = loads, port 1 = stores, port 2 = atomic operations (AMOs). Split into 3 independent streams to avoid head-of-line blocking." },
      { name: "wbdata_o (writeback_t[])", direction: "output", explanation: "The writeback buses back to the scoreboard. Each functional unit has its own bus. Valid=1 when the unit has a completed result. trans_id routes the result to the correct scoreboard slot." }
    ],
    snippets: [
      {
        label: "alu.sv — The Adder and Branch Compare Logic (actual CVA6 source)",
        language: "systemverilog",
        annotation: "The REAL CVA6 ALU — adder, branch compare, shift, and result mux. The entire module is combinational: no registers, result available same cycle.",
        code: `// Copyright 2018 ETH Zurich — Authors: Baer, Loi, Traber, Mueller, Zaruba
// Source: core/alu.sv

module alu import ariane_pkg::*; #(
    parameter config_pkg::cva6_cfg_t CVA6Cfg = config_pkg::cva6_cfg_empty,
    parameter type fu_data_t = logic
) (
    input  logic                      clk_i, rst_ni,
    input  fu_data_t                  fu_data_i,
    output logic [CVA6Cfg.XLEN-1:0]  result_o,
    output logic                      alu_branch_res_o  // → branch_unit
);
  logic [CVA6Cfg.XLEN-1:0] operand_a, operand_b;
  assign operand_a = fu_data_i.operand_a;
  assign operand_b = fu_data_i.operand_b;

  // ── ADDER: A - B = A + (~B) + 1 (carry-save, avoids separate subtractor) ──
  logic adder_op_b_negate;
  assign adder_op_b_negate = fu_data_i.operation inside {EQ, NE, SUB, SUBW, ANDN, ORN, XNOR};

  logic [CVA6Cfg.XLEN:0]   adder_in_a, adder_in_b;
  logic [CVA6Cfg.XLEN-1:0] adder_result;
  logic                    adder_z_flag;

  assign adder_in_a       = {operand_a, 1'b1};
  assign adder_in_b       = {operand_b, 1'b0} ^ {(CVA6Cfg.XLEN+1){adder_op_b_negate}};
  assign adder_result     = (adder_in_a + adder_in_b)[CVA6Cfg.XLEN:1];
  assign adder_z_flag     = ~|adder_result;  // zero flag: all bits NOR'd

  // ── BRANCH RESULT: driven directly by adder flags ─────────────────────────
  always_comb begin : branch_resolve
    unique case (fu_data_i.operation)
      EQ:       alu_branch_res_o = adder_z_flag;   // A==B: adder result is 0
      NE:       alu_branch_res_o = ~adder_z_flag;  // A!=B
      LTS, LTU: alu_branch_res_o = less;           // signed/unsigned less-than
      GES, GEU: alu_branch_res_o = ~less;
      default:  alu_branch_res_o = 1'b1;
    endcase
  end

  // ── SHIFT ─────────────────────────────────────────────────────────────────
  logic [$clog2(CVA6Cfg.XLEN)-1:0] shift_amt;
  assign shift_amt = operand_b[$clog2(CVA6Cfg.XLEN)-1:0];

  // ── RESULT MUX ────────────────────────────────────────────────────────────
  always_comb begin : result_mux
    unique case (fu_data_i.operation)
      ADD, SUB, ADDW, SUBW: result_o = adder_result;
      ANDL:  result_o = operand_a & operand_b;
      ORL:   result_o = operand_a | operand_b;
      XORL:  result_o = operand_a ^ operand_b;
      SLL:   result_o = operand_a << shift_amt;
      SRL:   result_o = operand_a >> shift_amt;
      SRA:   result_o = $signed(operand_a) >>> shift_amt;
      SLTS, SLTU: result_o = {63'b0, less};  // set-less-than signed/unsigned
      default: result_o = adder_result;
    endcase
  end
endmodule  // Entire module is combinational — result_o valid same cycle as inputs`
      }
    ],
    designDecisions: [
      "The ALU is fully combinational — zero pipeline registers. This is a deliberate CVA6 design choice: simpler forwarding (result available same cycle), at the cost of a longer critical path. A deeper pipelined CPU might register the ALU output for higher Fmax.",
      "The adder handles both ADD and SUB with one hardware adder. negating operand_b via XOR + carry-in=1 gives two's complement subtraction. This is standard practice — no extra area for a separate subtractor.",
      "alu_branch_res_o feeds the branch_unit.sv which uses it alongside the predicted target to determine is_mispredict. The ALU computes the condition; the branch unit computes the target address and misprediction flag.",
      "Three separate D-cache ports (load, store, AMO) in ex_stage prevent head-of-line blocking. Stores waiting for commit don't block loads ready to execute.",
      "alu_result_ex_id_o is the fastest forwarding path: ALU result goes directly back to issue stage operand mux — enabling back-to-back ALU instructions with zero stall cycles."
    ],

    relatedQuestions: ["l2-q1", "l1-q4", "l3-q3", "l2-q3", "l2-q5"]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LESSON 5: COMMIT STAGE
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "stage-05-commit",
    stage: 5,
    category: "Commit",
    title: "Stage 5 — commit_stage: Where Speculation Ends and Reality Begins",
    subtitle: "CVA6 core/commit_stage.sv",
    difficulty: "intermediate",
    duration: "11 min",
    summary: "Commit is the CPU's final arbiter. Only here are results written to the architectural register file, stores sent to cache, and exceptions taken. Everything before commit is speculative and reversible. This is what makes precise exceptions possible.",
    body: `After 25 years of teaching computer architecture, I can tell you this: most students understand the execute stage. But very few truly understand the commit stage. It is the most important piece of the CPU for correctness, and the most subtle.

THE FUNDAMENTAL PRINCIPLE: SPECULATION BOUNDARY

Everything before commit is speculative. The execute stage might have computed a result for an instruction that should never have executed (on a mispredicted branch path). The scoreboard might hold a perfectly computed load result from an instruction that actually caused a page fault. None of this matters until commit. Only at commit do effects become permanent.

Conversely, once commit_ack_o is asserted for an instruction, that instruction's effects are irrevocable. The register file has been updated. The store has been sent to cache. There is no undo.

WHAT commit_stage.sv DOES EVERY CYCLE:

STEP 1 — EVALUATE THE HEAD ENTRY
commit_stage receives commit_instr_i[0] (and optionally [1] for 2-wide commit). These are the scoreboard's oldest instructions. For each, commit_stage checks:
  • Is commit_instr_i[0].sbe.valid = 1? (result computed by execute stage)
  • Is commit_drop_i[0] = 1? (squashed — on mispredicted path, should discard)
  If valid=0: stall. Wait. Can't commit yet.
  If drop=1: free the slot without writing registers.

STEP 2 — EXCEPTION CHECK
If sbe.ex.valid = 1 on the head entry, this instruction has an exception. commit_stage:
  • Does NOT write to the register file
  • Does NOT drain any store buffer entry
  • Outputs exception_o = {cause, tval, valid=1}
  • The controller, upon seeing exception_o.valid=1, will:
    — Save the current PC to mepc/sepc CSR
    — Save exception cause to mcause/scause CSR
    — Save tval to mtval/stval CSR
    — Redirect the frontend to trap_vector_base
    — Assert flush_i to drain the pipeline

STEP 3 — REGISTER FILE WRITE
If no exception, commit_stage writes:
  waddr_o[0] = sbe.rd
  wdata_o[0] = sbe.result  (the computed value, placed here by the functional unit)
  we_gpr_o[0] = (sbe.rd != 0)  // Never write x0

For floating-point instructions, we_fpr_o is asserted and dirty_fp_state_o is set (telling the OS that FP registers are now dirty).

STEP 4 — STORE DRAIN
If the head instruction is a STORE, commit_stage asserts commit_lsu_o. The LSU's store buffer then drains its oldest entry to the D-cache. commit_lsu_ready_i must be asserted by the LSU to accept the drain — if the D-cache is busy (cache miss from a previous store), the drain stalls.

IMPORTANT: stores are committed atomically with their register writes (if any). A store instruction that fails should never drain to cache — the exception check in STEP 2 happens before STEP 4.

STEP 5 — CSR UPDATES
CSR instructions (CSRRW, etc.) write to the CSR register file at commit time. This is the correct ordering — CSR effects must be visible to subsequent committed instructions. MRET/SRET at commit: update privilege level, load return PC from mepc/sepc, assert set_pc_commit_i.

STEP 6 — INTERRUPT CHECK
Even if the head instruction has no exception, commit_stage checks for pending interrupts (from irq_ctrl_i). If an interrupt should be taken NOW (interrupts are globally enabled, the interrupt's privilege level is enabled, and it's not masked), commit_stage injects an exception with the interrupt cause code. The instruction that was about to commit is NOT committed — it gets replayed after the interrupt handler returns (MRET restores mepc to this PC).

PRECISE EXCEPTIONS — WHY THIS WORKS:
Consider: instruction A caused a page fault. Instructions B, C, D executed out-of-order AFTER A, produced results, and are sitting in the scoreboard. When A reaches the head of the scoreboard and commit sees A.ex.valid=1, it does NOT commit A, B, C, or D. Instead it flushes the entire pipeline. B, C, D are squashed. After the page fault handler fixes the mapping and returns via MRET, A is re-fetched and re-executed. The architectural state at the point of the fault is exactly as it should be — A never committed, so neither did B, C, D. This is precise exception semantics.`,
    keySignals: [
      { name: "commit_instr_i (scoreboard_entry_t[])", direction: "input", explanation: "The NrCommitPorts oldest scoreboard entries. commit_stage can only see and commit these — all younger instructions are invisible to it. This enforces in-order commit." },
      { name: "commit_drop_i", direction: "input", explanation: "Per-port: this instruction is on a squashed (mispredicted branch) path. Discard it from the scoreboard without writing registers." },
      { name: "commit_ack_o", direction: "output", explanation: "Acknowledge to scoreboard: instruction at port N has been processed (either committed or dropped). Scoreboard advances commit_pointer." },
      { name: "waddr_o / wdata_o / we_gpr_o", direction: "output", explanation: "Register file write port. THE ONLY PLACE in CVA6 that writes to the architectural register file. wdata_o = sbe.result (the value computed by the functional unit)." },
      { name: "exception_o (exception_t)", direction: "output", explanation: "Exception output to the controller. When valid=1: cause=exception code, tval=faulting address or instruction. The controller initiates the trap sequence: save PC, redirect to handler." },
      { name: "commit_lsu_o", direction: "output", explanation: "Signal to LSU to drain the oldest store buffer entry to D-cache. Only asserted when a STORE instruction commits cleanly (no exception)." },
      { name: "dirty_fp_state_o", direction: "output", explanation: "Asserted when an FP instruction commits. Sets mstatus.FS=Dirty, telling the OS kernel this process has modified FP registers and they must be saved on context switch." }
    ],
    snippets: [],
    designDecisions: [],
    relatedQuestions: []
  },

  {
    id: "stage-05-commit",
    stage: 5,
    category: "Commit",
    title: "Stage 5 — commit_stage: Where Speculation Ends and Reality Begins",
    subtitle: "CVA6 core/commit_stage.sv",
    difficulty: "intermediate",
    duration: "11 min",
    summary: "Commit is the CPU's final arbiter. Only here are results written to the architectural register file, stores sent to cache, and exceptions taken. Everything before commit is speculative and reversible. This is what makes precise exceptions possible.",
    body: `After 25 years of teaching computer architecture, I can tell you this: most students understand the execute stage. But very few truly understand the commit stage. It is the most important piece of the CPU for correctness, and the most subtle.

THE FUNDAMENTAL PRINCIPLE: SPECULATION BOUNDARY

Everything before commit is speculative. The execute stage might have computed a result for an instruction that should never have executed (on a mispredicted branch path). The scoreboard might hold a perfectly computed load result from an instruction that actually caused a page fault. None of this matters until commit. Only at commit do effects become permanent.

Conversely, once commit_ack_o is asserted for an instruction, that instruction's effects are irrevocable. The register file has been updated. The store has been sent to cache. There is no undo.

WHAT commit_stage.sv DOES EVERY CYCLE:

STEP 1 — EVALUATE THE HEAD ENTRY
commit_stage receives commit_instr_i[0] (and optionally [1] for 2-wide commit). These are the scoreboard's oldest instructions. For each, commit_stage checks:
  • Is commit_instr_i[0].sbe.valid = 1? (result computed by execute stage)
  • Is commit_drop_i[0] = 1? (squashed — on mispredicted path, should discard)
  If valid=0: stall. Wait. Can't commit yet.
  If drop=1: free the slot without writing registers.

STEP 2 — EXCEPTION CHECK
If sbe.ex.valid = 1 on the head entry, this instruction has an exception. commit_stage:
  • Does NOT write to the register file
  • Does NOT drain any store buffer entry
  • Outputs exception_o = {cause, tval, valid=1}
  • The controller, upon seeing exception_o.valid=1, will:
    — Save the current PC to mepc/sepc CSR
    — Save exception cause to mcause/scause CSR
    — Save tval to mtval/stval CSR
    — Redirect the frontend to trap_vector_base
    — Assert flush_i to drain the pipeline

STEP 3 — REGISTER FILE WRITE
If no exception, commit_stage writes:
  waddr_o[0] = sbe.rd
  wdata_o[0] = sbe.result  (the computed value, placed here by the functional unit)
  we_gpr_o[0] = (sbe.rd != 0)  // Never write x0

For floating-point instructions, we_fpr_o is asserted and dirty_fp_state_o is set (telling the OS that FP registers are now dirty).

STEP 4 — STORE DRAIN
If the head instruction is a STORE, commit_stage asserts commit_lsu_o. The LSU's store buffer then drains its oldest entry to the D-cache. commit_lsu_ready_i must be asserted by the LSU to accept the drain — if the D-cache is busy (cache miss from a previous store), the drain stalls.

IMPORTANT: stores are committed atomically with their register writes (if any). A store instruction that fails should never drain to cache — the exception check in STEP 2 happens before STEP 4.

STEP 5 — CSR UPDATES
CSR instructions (CSRRW, etc.) write to the CSR register file at commit time. This is the correct ordering — CSR effects must be visible to subsequent committed instructions. MRET/SRET at commit: update privilege level, load return PC from mepc/sepc, assert set_pc_commit_i.

STEP 6 — INTERRUPT CHECK
Even if the head instruction has no exception, commit_stage checks for pending interrupts (from irq_ctrl_i). If an interrupt should be taken NOW (interrupts are globally enabled, the interrupt's privilege level is enabled, and it's not masked), commit_stage injects an exception with the interrupt cause code. The instruction that was about to commit is NOT committed — it gets replayed after the interrupt handler returns (MRET restores mepc to this PC).

PRECISE EXCEPTIONS — WHY THIS WORKS:
Consider: instruction A caused a page fault. Instructions B, C, D executed out-of-order AFTER A, produced results, and are sitting in the scoreboard. When A reaches the head of the scoreboard and commit sees A.ex.valid=1, it does NOT commit A, B, C, or D. Instead it flushes the entire pipeline. B, C, D are squashed. After the page fault handler fixes the mapping and returns via MRET, A is re-fetched and re-executed. The architectural state at the point of the fault is exactly as it should be — A never committed, so neither did B, C, D. This is precise exception semantics.`,
    keySignals: [
      { name: "commit_instr_i (scoreboard_entry_t[])", direction: "input", explanation: "The NrCommitPorts oldest scoreboard entries. commit_stage can only see and commit these — all younger instructions are invisible to it. This enforces in-order commit." },
      { name: "commit_drop_i", direction: "input", explanation: "Per-port: this instruction is on a squashed (mispredicted branch) path. Discard it from the scoreboard without writing registers." },
      { name: "commit_ack_o", direction: "output", explanation: "Acknowledge to scoreboard: instruction at port N has been processed (either committed or dropped). Scoreboard advances commit_pointer." },
      { name: "waddr_o / wdata_o / we_gpr_o", direction: "output", explanation: "Register file write port. THE ONLY PLACE in CVA6 that writes to the architectural register file. wdata_o = sbe.result (the value computed by the functional unit)." },
      { name: "exception_o (exception_t)", direction: "output", explanation: "Exception output to the controller. When valid=1: cause=exception code, tval=faulting address or instruction. The controller initiates the trap sequence: save PC, redirect to handler." },
      { name: "commit_lsu_o", direction: "output", explanation: "Signal to LSU to drain the oldest store buffer entry to D-cache. Only asserted when a STORE instruction commits cleanly (no exception)." },
      { name: "dirty_fp_state_o", direction: "output", explanation: "Asserted when an FP instruction commits. Sets mstatus.FS=Dirty, telling the OS kernel this process has modified FP registers and they must be saved on context switch." }
    ],
    snippets: [
      {
        label: "commit_stage.sv — The Actual Commit Logic (real CVA6 source, ETH Zurich)",
        language: "systemverilog",
        annotation: "This is the REAL always_comb : commit block from CVA6. Every line is production code. Read the condition chain: valid → not halted → no exception → ack and write.",
        code: `// Copyright 2018 ETH Zurich — Author: Florian Zaruba
// Source: core/commit_stage.sv — the always_comb : commit block

// waddr is wired directly from the scoreboard entry rd field:
for (genvar i = 0; i < CVA6Cfg.NrCommitPorts; i++)
  assign waddr_o[i] = commit_instr_i[i].rd;  // always, regardless of exception

assign pc_o = commit_instr_i[0].pc;  // commit PC exposed to frontend/CSR

// ── MAIN COMMIT LOGIC (from commit_stage.sv : always_comb : commit) ───────
always_comb begin : commit
  // Default: nothing happens
  commit_ack_o[0]  = 1'b0;
  we_gpr_o[0]      = 1'b0;
  we_fpr_o         = '{default: 1'b0};
  commit_lsu_o     = 1'b0;
  commit_csr_o     = 1'b0;
  wdata_o[0]       = commit_instr_i[0].result; // result from scoreboard (written by FU)
  csr_op_o         = ADD;  // NOP for CSR unit
  fence_i_o        = 1'b0;
  fence_o          = 1'b0;
  sfence_vma_o     = 1'b0;
  flush_commit_o   = 1'b0;

  // ── COMMIT PORT 0 ─────────────────────────────────────────────────────
  if (commit_instr_i[0].valid && !halt_i) begin

    if (commit_instr_i[0].ex.valid || break_from_trigger_i) begin
      // EXCEPTION PATH: instruction has an exception — only ack if it was dropped
      if (commit_drop_i[0])
        commit_ack_o[0] = 1'b1;  // free the slot, don't write anything
      // exception_o is driven separately from this block

    end else begin
      // CLEAN COMMIT PATH
      commit_ack_o[0] = 1'b1;

      // ── Select what to do based on functional unit ────────────────────
      unique case (commit_instr_i[0].fu)

        ALU, MULT: begin  // Integer result → write to GPR
          we_gpr_o[0] = (commit_instr_i[0].rd != 5'b0); // never write x0
        end

        LOAD: begin       // Load result → write to GPR (data came from cache/SB)
          we_gpr_o[0] = (commit_instr_i[0].rd != 5'b0);
        end

        STORE: begin      // Store → drain store buffer to D-cache
          commit_lsu_o = !flush_dcache_i; // hold stores during cache flush
          if (!commit_lsu_ready_i)        // D-cache busy — stall commit
            commit_ack_o[0] = 1'b0;
        end

        CSR: begin        // CSR instruction → update CSR register file
          // csr_op_o and csr_wdata_o are set here; CSR unit does the write
          commit_csr_o = 1'b1;
          csr_op_o     = commit_instr_i[0].op;
          csr_wdata_o  = commit_instr_i[0].result;
          we_gpr_o[0]  = (commit_instr_i[0].rd != 5'b0); // CSRR reads also write rd
          // Special cases: FENCE.I, FENCE, SFENCE.VMA
          if (commit_instr_i[0].op == FENCE_I)  fence_i_o    = 1'b1;
          if (commit_instr_i[0].op == FENCE)    fence_o      = 1'b1;
          if (commit_instr_i[0].op == SFENCE_VMA) sfence_vma_o = 1'b1;
        end

        FPU: begin        // FP result → write to FP register file
          we_fpr_o[0] = 1'b1;
        end

        default: ;
      endcase
    end
  end
end  // always_comb : commit

// ── EXCEPTION OUTPUT (separate from commit logic) ─────────────────────────
// Driven combinationally when head instruction has an unhandled exception
assign exception_o.valid = commit_instr_i[0].valid
                           && commit_instr_i[0].ex.valid
                           && !commit_drop_i[0]
                           && !halt_i;
assign exception_o.cause = commit_instr_i[0].ex.cause;
assign exception_o.tval  = commit_instr_i[0].ex.tval;`
      },
      {
        label: "The Store Commitment Problem — Why Stores Need Two Steps",
        language: "systemverilog",
        annotation: "This shows why stores go through the store buffer and are drained at commit, not at execute. It's a correctness requirement, not just an optimization.",
        code: `// WHY STORES CANNOT WRITE TO CACHE AT EXECUTE TIME:
//
// Consider this code:
//   beq  x1, x2, label    // branch
//   sw   x3, 0(x4)        // store (speculatively executed)
//   ...
// label:
//   ...
//
// If the branch is TAKEN, the 'sw' instruction should never have executed.
// But the execute stage ran it speculatively and computed the address and data.
//
// If we had written to the D-cache at execute time, memory would be corrupted.
//
// Instead:
// 1. Execute stage: LSU computes address, puts {addr, data} into store buffer
// 2. Store buffer entry marked "speculative" until commit
// 3. Branch resolves: TAKEN → pipeline flush, store buffer entry discarded
//    OR: NOT TAKEN → store_buffer entry remains, instruction commits normally
// 4. Commit stage: sw instruction reaches head of scoreboard with valid=1
//    → commit_stage asserts commit_lsu_o
//    → LSU's store buffer drains the head entry to D-cache
//    → ONLY NOW is the memory write architecturally visible

// The store buffer in store_unit.sv:
typedef struct packed {
  logic [VLEN-1:0]      vaddr;    // Virtual address (for TLB check)
  logic [PLEN-1:0]      paddr;    // Physical address (post-TLB)
  logic [XLEN-1:0]      data;     // Data to write
  logic [(XLEN/8)-1:0]  be;       // Byte enables
  logic [TRANS_ID_BITS-1:0] trans_id;
  logic                 valid;    // Entry is occupied
  logic                 committed;// Commit stage said to drain this
} st_buffer_t;

// Only when committed=1 does the store buffer write to the D-cache.
// Before that, the data is "pending" — visible to younger loads via
// store-to-load forwarding, but invisible to any other core.`
      }
    ],
    designDecisions: [
      "commit_drop_i exists for a subtle reason. When a branch misprediction is detected, the controller squashes the scoreboard — it marks all entries after the mispredicted branch as 'to be dropped'. These entries may have already completed (valid=1), but they're on the wrong path. commit_drop_i lets commit_stage free these slots without writing their results.",
      "halt_i (from WFI/debug) prevents commit entirely — no instructions commit, no register writes, no store drains. The pipeline simply holds in place. This is the correct behavior for WFI (Wait For Interrupt) — the CPU stays stopped until an interrupt arrives.",
      "flush_dcache_i delays store commits. During a fence.i (instruction cache synchronization), all pending stores must first be written to cache, then the I-cache is flushed. commit_stage holds new store drains while the D-cache is being flushed to ensure all stores are in cache before the I-cache sees the new instructions.",
      "NrCommitPorts=2 (2-wide commit) requires that both head entries be checked simultaneously. If entry 0 is a store and entry 1 is a register instruction, they CAN commit in the same cycle (different resources: store drain vs register write). If both are register instructions writing to different registers, they commit simultaneously with two register file write ports.",
      "The single_step feature (for GDB debugging) works by: commit one instruction, then assert single_step_o, which generates a debug exception, transferring control to the debug module. From the OS's perspective, the CPU took a breakpoint trap after every instruction. The debug module handles the GDB protocol and resumes the CPU for one instruction at a time."
    ],
    relatedQuestions: ["l3-q1", "l3-q3", "l1-q3", "l2-q6", "l3-q4"]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LESSON 6: BTB — Branch Target Buffer
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "file-btb",
    stage: 6,
    category: "Frontend Details",
    title: "btb.sv — Branch Target Buffer: Where To Jump",
    subtitle: "CVA6 core/frontend/btb.sv",
    difficulty: "intermediate",
    duration: "8 min",
    summary: "The BHT tells you WHETHER to take a branch. The BTB tells you WHERE to jump. Together they give the frontend a predicted next PC every cycle before the instruction is even decoded.",
    body: `The Branch Target Buffer (BTB) is a cache of branch targets. Every time a branch or jump instruction executes and its target is computed by the branch unit, the BTB stores: the PC of the branch instruction → the target address it jumped to. On subsequent fetches, when the frontend sees that PC again, it can predict the target before the instruction is even decoded.

HOW THE BTB WORKS:

STRUCTURE:
The BTB is an array of NR_ENTRIES entries. Like the BHT, it is indexed by a subset of the fetch PC bits (the index field). But unlike the BHT which stores just a 2-bit counter, each BTB entry stores a full btb_prediction_t struct which contains:
  • valid: is this entry populated?
  • target_address: the predicted jump target (full VLEN-bit address)

PREDICTION (read path):
Every cycle, the frontend indexes the BTB using the current fetch PC bits. If the indexed entry is valid, the prediction output (btb_prediction_o) carries that target address. The frontend feeds this to its PC mux alongside the BHT prediction. The combined logic is: if BHT says taken AND BTB has a valid entry for this PC → use BTB target as next PC.

UPDATE (write path):
When the branch unit in the execute stage resolves a branch or jump, it sends btb_update_i: pc (the branch instruction's PC), target_address (where it actually went), valid (this update is real). The BTB writes target_address into the entry indexed by pc.

ALIASING AND ANTIALIAS_BITS:
With a small BTB (8–64 entries), many different branch PCs map to the same index — aliasing. A different branch's target gets evicted. CVA6 uses ANTIALIAS_BITS (8 bits from higher PC bits) stored alongside the tag to detect false hits. If the upper PC bits don't match, the prediction is invalid even if the index matched.

FPGA vs ASIC IMPLEMENTATION:
The btb.sv has two implementations selected by CVA6Cfg.FpgaEn:
  • ASIC: stores target_address in flip-flops — fast single-cycle read, full flush support
  • FPGA: uses Block RAM (BRAM) — more area-efficient on FPGAs but 1-cycle read latency, flush not supported (the frontend flush signal is not connected to BRAM clear logic)

WHY IS THE BTB SEPARATE FROM THE BHT?
The BHT is purely about direction prediction (taken/not-taken). It doesn't know the target. The BTB is about target prediction. They serve complementary purposes:
  • BHT has 1024 entries (one per branch PC, tracking history)
  • BTB has only 8 entries (much smaller — full addresses are expensive to store)
  • Unconditional jumps (JAL, JALR) only need the BTB — they're always taken, no BHT needed
  • Return instructions (JALR x0, ra) use the RAS (Return Address Stack) instead of the BTB

The BTB, BHT, and RAS together form CVA6's complete branch prediction system.`,
    keySignals: [
      { name: "vpc_i", direction: "input", explanation: "Current fetch PC — used to index the BTB for prediction. Lower bits select the row, the upper ANTIALIAS_BITS are compared against the stored tag to detect aliasing." },
      { name: "btb_update_i", direction: "input", explanation: "Update from the branch unit after a branch resolves. Contains: pc (branch instruction's address), target_address (actual destination), valid (update is real). Overwrites the BTB entry indexed by pc." },
      { name: "btb_prediction_o (btb_prediction_t[])", direction: "output", explanation: "One prediction per issue port. Contains: valid (BTB has an entry for this PC) and target_address (the predicted destination). The frontend uses this only when BHT also predicts taken." },
      { name: "flush_bp_i", direction: "input", explanation: "Flush all BTB valid bits — clears the entire predictor. Asserted on fence.i and context switches. Only works on ASIC target; FPGA BTB cannot be flushed (BRAM limitation)." }
    ],
    snippets: [
      {
        label: "btb.sv — ASIC target: storage, prediction read, and update write (actual CVA6)",
        language: "systemverilog",
        annotation: "The BTB is an array of btb_prediction_t structs. Prediction is a direct array read; update is a direct array write. Simple and fast.",
        code: `// Copyright 2018-2019 ETH Zurich — Florian Zaruba
// Source: core/frontend/btb.sv — ASIC TARGET section

// ── INDEX CALCULATION ─────────────────────────────────────────────────────
localparam OFFSET          = CVA6Cfg.RVC ? 1 : 2; // skip always-0 LSB
localparam NR_ROWS         = NR_ENTRIES / CVA6Cfg.INSTR_PER_FETCH;
localparam ANTIALIAS_BITS  = 8; // upper PC bits stored as tag to reduce aliasing

logic [$clog2(NR_ROWS)-1:0] index, update_pc;
assign index     = vpc_i    [PREDICTION_BITS-1 : ROW_ADDR_BITS+OFFSET]; // fetch PC index
assign update_pc = btb_update_i.pc[PREDICTION_BITS-1 : ROW_ADDR_BITS+OFFSET]; // update index

// ── THE BTB STORAGE (flip-flops on ASIC) ─────────────────────────────────
// btb_prediction_t contains: valid (1-bit) + target_address (VLEN bits)
btb_prediction_t [NR_ROWS-1:0][CVA6Cfg.INSTR_PER_FETCH-1:0] btb_d, btb_q;

// ── PREDICTION: combinational array read ─────────────────────────────────
for (genvar i = 0; i < CVA6Cfg.INSTR_PER_FETCH; i++) begin : gen_btb_output
  assign btb_prediction_o[i] = btb_q[index][i]; // direct array read — 0 latency
end

// ── UPDATE: write target on branch resolution ─────────────────────────────
always_comb begin : update_btb
  btb_d = btb_q;  // default: hold all entries

  if ((btb_update_i.valid && CVA6Cfg.DebugEn && !debug_mode_i)
      || (btb_update_i.valid && !CVA6Cfg.DebugEn)) begin
    btb_d[update_pc][update_row_index].valid          = 1'b1;
    btb_d[update_pc][update_row_index].target_address = btb_update_i.target_address;
    // Store upper PC bits as antialias tag to detect false index matches
    btb_d[update_pc][update_row_index].antialias_bits =
        btb_update_i.pc[PREDICTION_BITS+ANTIALIAS_BITS-1 : PREDICTION_BITS];
  end
end

// ── FLUSH: clear all valid bits ───────────────────────────────────────────
always_ff @(posedge clk_i or negedge rst_ni) begin
  if (!rst_ni || flush_bp_i) begin
    // Clear all entries — only valid bits need clearing, target_address can be stale
    for (int i = 0; i < NR_ROWS; i++)
      for (int j = 0; j < CVA6Cfg.INSTR_PER_FETCH; j++)
        btb_q[i][j].valid <= 1'b0;
  end else begin
    btb_q <= btb_d;
  end
end`
      }
    ],
    designDecisions: [
      "NR_ENTRIES=8 by default — tiny on purpose. Target addresses are full 64-bit values; storing thousands of them is expensive. The BTB trades capacity for speed and area. Most loops are short so 8 entries captures the hot branches.",
      "ANTIALIAS_BITS prevents false predictions: if two branches at different addresses map to the same BTB index, the stored upper-PC tag will mismatch for one of them, suppressing the false prediction. Without this, aliasing would cause random mispredictions.",
      "FPGA target uses Block RAM instead of flip-flops. BRAMs are more area-efficient on FPGAs than arrays of flip-flops. The tradeoff: BRAMs add 1 cycle read latency, and CVA6's FPGA BTB does not support flush (fence.i doesn't clear it). Acceptable for FPGA prototyping, not silicon.",
      "The BTB is indexed by the FETCH PC, not the instruction PC. On a superscalar frontend fetching 2 instructions per cycle, each fetch address can contain 2 instructions — so the BTB has INSTR_PER_FETCH sub-entries per row, one for each potential instruction position.",
      "JAL (unconditional jump) benefits most from the BTB: it's always taken (no BHT needed), but its target changes every invocation. The BTB caches the last-seen target. A BTB miss on a JAL causes one wasted fetch cycle."
    ],
    relatedQuestions: ["l3-q2", "l1-q5", "l1-q6"]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LESSON 7: BRANCH UNIT
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "file-branch-unit",
    stage: 7,
    category: "Execute Details",
    title: "branch_unit.sv — Branch Resolution and Misprediction Detection",
    subtitle: "CVA6 core/branch_unit.sv",
    difficulty: "intermediate",
    duration: "9 min",
    summary: "The branch unit computes the actual branch outcome and target, compares against the frontend's prediction, and raises is_mispredict if they differ. This single signal triggers a full pipeline flush.",
    body: `The branch unit is small but its output — resolved_branch_o — is the most consequential signal in the CPU. When is_mispredict goes high, the pipeline flushes and restarts. Let me walk through exactly how it works.

INPUTS THE BRANCH UNIT RECEIVES:

From the issue stage via fu_data_i:
  • operation: JALR, JAL, BEQ, BNE, BLT, BGE, BLTU, BGEU
  • operand_a: rs1 value (for JALR: the base register)
  • operand_b: rs2 value (for branches: compared against operand_a)
  • imm: the branch offset (sign-extended from the instruction)

From the ALU (parallel, same cycle):
  • branch_comp_res_i: the result of the comparison — 1=condition true, 0=condition false
  The ALU computed operand_a - operand_b and checked EQ/NE/LT/GE flags. The branch unit DOESN'T redo this comparison — it just reads the ALU's output. This is a clean separation: ALU does arithmetic, branch unit does flow control.

From the scoreboard (carried in the scoreboard_entry_t.bp field):
  • branch_predict_i.cf: the type of control flow the frontend predicted (BRANCH / JUMP / NONE)
  • branch_predict_i.predict_address: the PC the frontend thought we'd jump to

WHAT THE BRANCH UNIT COMPUTES:

STEP 1 — COMPUTE JUMP BASE:
  For JALR: jump_base = operand_a (rs1 register value)
  For all others (branches, JAL): jump_base = pc_i (the instruction's own PC)

STEP 2 — COMPUTE TARGET ADDRESS:
  target_address = jump_base + sign_extend(imm)
  Special: for JALR, force target_address[0] = 0 (RISC-V spec: clear LSB for alignment)

STEP 3 — COMPUTE NEXT PC (for JAL/JALR return address):
  next_pc = pc_i + 4  (or +2 for compressed instructions)
  This goes into branch_result_o — the rd write-back value for JAL/JALR (link register)

STEP 4 — RESOLVE TAKEN/NOT-TAKEN:
  For unconditional jumps (JAL, JALR): always taken
  For conditional branches: taken = branch_comp_res_i (from ALU)

STEP 5 — DETECT MISPREDICTION:
  resolved_branch_o.is_mispredict = taken AND (actual_target != predicted_target)
                                    OR !taken AND (frontend thought it was taken)

  In code: is_mispredict = (taken ? target_address : next_pc) != branch_predict_i.predict_address

STEP 6 — OUTPUT bp_resolve_t:
  • valid: branch_valid_i (this resolution is real)
  • pc: pc_i (the branch's own PC — used to update BHT/BTB)
  • target_address: where we're actually going
  • is_mispredict: was the frontend wrong?
  • is_taken: actual direction
  • cf_type: carried from branch_predict_i.cf

WHAT HAPPENS ON MISPREDICTION:
The resolved_branch_o.is_mispredict signal reaches:
  1. The CONTROLLER module: asserts flush_i to the frontend, squashes the scoreboard
  2. The FRONTEND: redirects PC to resolved_branch_o.target_address
  3. The SCOREBOARD: cancels all entries issued after this branch (sets cancelled=1)

The pipeline clears in one cycle. Fetch restarts from the correct address next cycle. All instructions that were in flight after the branch are dropped — their results are never committed.`,
    keySignals: [
      { name: "fu_data_i.operation", direction: "input", explanation: "Which branch op: JALR, JAL, BEQ, BNE, BLT, BGE, BLTU, BGEU. Determines how jump_base and taken are computed." },
      { name: "branch_comp_res_i", direction: "input", explanation: "The comparison result FROM THE ALU — 1 if the branch condition is true. The branch unit does NOT recompute this; it relies on the ALU's output. Clean separation of concerns." },
      { name: "branch_predict_i (branchpredict_sbe_t)", direction: "input", explanation: "The frontend's original prediction, carried through the pipeline in scoreboard_entry_t.bp. Contains predict_address (where the frontend thought we'd go) for misprediction comparison." },
      { name: "resolved_branch_o (bp_resolve_t)", direction: "output", explanation: "The ground truth: actual target, actual taken/not-taken, and is_mispredict. Goes to the controller (which asserts flush) and the frontend (which redirects PC). The most important signal in CVA6." },
      { name: "branch_result_o", direction: "output", explanation: "The return address value: PC + 4 (or +2 for compressed). Written to rd for JAL and JALR instructions. This is what links a function call's return address." },
      { name: "resolve_branch_o", direction: "output", explanation: "Separate from is_mispredict — just signals 'a branch resolved this cycle'. The scoreboard uses this to know it can now accept new instructions after a branch that was blocking issue." }
    ],
    snippets: [
      {
        label: "branch_unit.sv — mispredict_handler always_comb (actual CVA6 source)",
        language: "systemverilog",
        annotation: "This is the REAL mispredict_handler from CVA6. Every line matters. The is_mispredict determination is a single comparison of actual vs predicted target.",
        code: `// Copyright 2018 ETH Zurich — Florian Zaruba
// Source: core/branch_unit.sv

logic [CVA6Cfg.VLEN-1:0] target_address, next_pc;

always_comb begin : mispredict_handler
  // Set jump base: JALR uses rs1 (operand_a), all others use the PC
  automatic logic [CVA6Cfg.VLEN-1:0] jump_base;
  jump_base = (fu_data_i.operation == JALR) ? fu_data_i.operand_a[CVA6Cfg.VLEN-1:0] : pc_i;

  // Default outputs
  resolve_branch_o              = 1'b0;
  resolved_branch_o.target_address = '0;
  resolved_branch_o.is_taken    = 1'b0;
  resolved_branch_o.valid       = branch_valid_i;
  resolved_branch_o.is_mispredict = 1'b0;
  resolved_branch_o.cf_type     = branch_predict_i.cf; // carry forward from fetch

  // Next PC for link register (rd write-back for JAL/JALR)
  next_pc = pc_i + (is_compressed_instr_i ? 'd2 : 'd4);

  // Target = jump_base + sign_extended_imm
  target_address = $unsigned($signed(jump_base) + $signed(fu_data_i.imm[CVA6Cfg.VLEN-1:0]));

  // JALR: force LSB = 0 (RISC-V spec requirement for alignment)
  if (fu_data_i.operation == JALR) target_address[0] = 1'b0;

  // branch_result_o = return address (written to rd for JAL/JALR)
  branch_result_o = next_pc;
  resolved_branch_o.pc = pc_i;

  if (branch_valid_i) begin
    resolve_branch_o = 1'b1;

    // THE MISPREDICTION CHECK: compare actual target vs predicted target
    resolved_branch_o.target_address = branch_comp_res_i ? target_address : next_pc;
    resolved_branch_o.is_taken       = branch_comp_res_i;

    // is_mispredict = 1 if frontend's predicted next PC ≠ actual next PC
    resolved_branch_o.is_mispredict =
        branch_predict_i.cf == ariane_pkg::NoCF   // frontend predicted no branch
        ? branch_comp_res_i                        // but we ARE taking it → mispredict
        : (branch_comp_res_i                       // frontend predicted a branch:
           ? (branch_predict_i.predict_address != target_address)  // wrong target
           : (branch_predict_i.cf != ariane_pkg::NoCF));           // predicted taken but NT

    // MISALIGNED EXCEPTION: target address must be 4-byte aligned (or 2-byte for C ext)
    if (branch_comp_res_i && !CVA6Cfg.RVC && target_address[1]) begin
      branch_exception_o.valid = 1'b1;
      branch_exception_o.cause = riscv::INSTR_ADDR_MISALIGNED;
      branch_exception_o.tval  = {{CVA6Cfg.XLEN-CVA6Cfg.VLEN{1'b0}}, target_address};
    end
  end
end`
      }
    ],
    designDecisions: [
      "The branch unit reuses the ALU's comparison result (branch_comp_res_i) rather than recomputing it. This avoids duplicating the comparator hardware. The ALU computes the condition and the branch unit interprets it — single responsibility principle in hardware.",
      "JALR forces target[0]=0 per the RISC-V specification. This ensures all instruction fetches are at least 2-byte aligned (required for compressed instruction support). Without this mask, a JALR to an odd address would cause a misaligned fetch exception.",
      "branch_result_o is next_pc (PC+4 or PC+2), not target_address. For a JAL to a function, rd gets the return address (where to come back), not the function's address. This is the link in 'branch and link'.",
      "resolve_branch_o (distinct from is_mispredict) is a one-cycle pulse that tells the scoreboard 'a branch resolved'. This releases any issue-stage stall that was waiting for branch resolution before issuing instructions (some implementations stall after a branch until it resolves to avoid speculative execution).",
      "Misaligned branch target detection happens HERE, not in the cache. If a branch targets an odd address (or non-2-byte-aligned with no C extension), a branch_exception_o is raised. This exception flows through the pipeline like any other: it's carried in scoreboard_entry_t.ex and handled at commit."
    ],
    relatedQuestions: ["l3-q2", "l2-q1", "l1-q6", "l1-q5"]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LESSON 8: LOAD-STORE UNIT
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "file-lsu",
    stage: 8,
    category: "Execute Details",
    title: "load_store_unit.sv — Memory Access, TLB, and Store Buffer",
    subtitle: "CVA6 core/load_store_unit.sv",
    difficulty: "advanced",
    duration: "13 min",
    summary: "The LSU is the most complex functional unit. It handles address translation (MMU/TLB), cache access, store buffer management, store-to-load forwarding, and memory ordering. A cache miss can stall the pipeline for 200+ cycles.",
    body: `The Load-Store Unit (LSU) is where the CPU's execution meets the memory system. It is significantly more complex than the ALU because memory access involves: address translation (virtual→physical), cache lookup, store ordering, and data alignment. Let me walk through each piece.

THE LSU'S INTERNAL PIPELINE:

A load instruction goes through these steps:
  1. AGU (Address Generation): effective_addr = operand_a + sign_extend(imm) — same cycle as dispatch
  2. TLB Lookup: translate virtual address to physical address — 1 cycle if TLB hits
  3. D-Cache Tag Lookup: use physical address index to read tag array — 1 cycle
  4. Tag Compare + Data Read: verify tag match, read data from data array — 1 cycle  
  5. Data Alignment: extract correct bytes (for byte/halfword loads), sign-extend — combinational

Best case: 4 cycles from dispatch to result ready.
TLB miss: add 10-50 cycles for page table walk (PTW)
D-cache miss: add 10-200+ cycles for L2/DRAM fetch

A store instruction:
  1. AGU: compute address — same cycle
  2. TLB: translate — 1 cycle
  3. Write to STORE BUFFER — 1 cycle (does NOT write to cache!)
  4. Wait for commit from commit_stage — variable
  5. On commit: drain store buffer entry to D-cache

THE STORE BUFFER — WHY IT EXISTS:
Stores cannot write to the D-cache immediately. The instruction might be on a speculative path (wrong branch prediction). The store must wait until it commits — only then is it guaranteed to be architecturally valid.

The store buffer is a queue of (paddr, data, byte_enables, trans_id) entries. It sits between the execute stage and the D-cache. At commit time, commit_stage asserts commit_i, and the store buffer drains its oldest committed entry to the D-cache.

STORE-TO-LOAD FORWARDING:
What if a load follows a store to the same address, but the store hasn't committed yet and thus hasn't been written to cache? The load would read stale data from the D-cache. Solution: the load_unit checks the store buffer for address matches. If a store buffer entry has a matching address (same physical address, fully covering the load's byte range), the load gets the data from the store buffer instead of the D-cache. This is store-to-load forwarding — mandatory for correctness.

THE MMU (Memory Management Unit):
CVA6's LSU contains an MMU sub-module that handles virtual memory. For every load/store:
  • L1 DTLB lookup: if the virtual address is in the TLB, get physical address in 1 cycle
  • On DTLB miss: raise a page table walk request to the PTW (Page Table Walker)
  • PTW walks the page table in memory: reads PTE (Page Table Entries) until it finds the translation
  • If PTE has valid=0 or permission bits don't match → page fault exception

The MMU also checks permissions: user mode can't access kernel pages (U bit in PTE), read-only pages can't be stored to (W bit), and execute-only pages can't be loaded from in some configurations (when PMA/PMP rules apply).

THE THREE D-CACHE PORTS:
CVA6's D-cache interface has 3 ports:
  • Port 0 (load): load_unit → D-cache read
  • Port 1 (store): store_unit → D-cache write (only on commit drain)
  • Port 2 (AMO): atomic memory operations (LR/SC, AMOSWAP, etc.) — requires exclusive cache line access

SPECULATIVE LOADS:
In CVA6, loads execute speculatively — before older stores have committed. The resolved_branch_i signal feeds into the LSU: when a misprediction is detected, any load that was dispatched on the wrong path is marked invalid and its result is discarded. The speculative_load_i signal handles non-idempotent memory regions (memory-mapped I/O) where speculative reads could have side effects — these are never speculated.`,
    keySignals: [
      { name: "fu_data_i", direction: "input", explanation: "From issue stage: operation (LOAD/STORE size and signedness), operand_a (base address register), operand_b (store data), imm (address offset), trans_id." },
      { name: "lsu_ready_o", direction: "output", explanation: "Deasserted when the LSU cannot accept new instructions — e.g., store buffer is full, TLB miss in progress, or pending AMO is blocking. The issue stage stalls when lsu_ready_o=0." },
      { name: "load_result_o / load_valid_o", direction: "output", explanation: "Load writeback to scoreboard: the loaded data and a valid strobe. load_valid_o pulses for one cycle when the cache returns data. The scoreboard captures this via the writeback bus." },
      { name: "store_result_o / store_valid_o", direction: "output", explanation: "Store writeback to scoreboard: stores write 0 to rd (stores have no destination register) and pulse store_valid_o to tell the scoreboard the store has been processed." },
      { name: "commit_i / commit_ready_o", direction: "input/output", explanation: "commit_stage signals commit_i when a store instruction commits. The store buffer drains its oldest entry to D-cache. commit_ready_o is deasserted while the drain is in progress." },
      { name: "no_st_pending_o", direction: "output", explanation: "Asserted when the store buffer is completely empty. The commit stage checks this during fence instructions — a FENCE must wait until all pending stores have been written to cache." },
      { name: "resolved_branch_i", direction: "input", explanation: "Branch resolution from the branch unit. The LSU uses this to kill any in-flight load that was on the mispredicted path. Speculative loads that complete but were on wrong-path are discarded." }
    ],
    snippets: [
      {
        label: "load_store_unit.sv — Internal structure: store buffer + forwarding (CVA6 architecture)",
        language: "systemverilog",
        annotation: "The LSU instantiates load_unit, store_unit, mmu, and the store buffer. This shows the key inter-connections and the store-to-load forwarding path.",
        code: `// Copyright 2018 ETH Zurich — Florian Zaruba
// Source: core/load_store_unit.sv — internal instantiation and forwarding

// ── Internal signal declarations ──────────────────────────────────────────
logic [CVA6Cfg.VLEN-1:0]    vaddr_i;    // virtual address from AGU
logic [CVA6Cfg.PLEN-1:0]    paddr;      // physical address from MMU/TLB
logic [CVA6Cfg.XLEN-1:0]    st_data;    // store data
logic [(CVA6Cfg.XLEN/8)-1:0] st_be;     // store byte enables

// ── AGU: Address = operand_a + sign_extend(imm) ─────────────────────────
assign vaddr_i = fu_data_i.operand_a[CVA6Cfg.VLEN-1:0]
               + fu_data_i.imm[CVA6Cfg.VLEN-1:0];

// ── MMU: Virtual → Physical address translation ───────────────────────────
mmu #(.CVA6Cfg(CVA6Cfg), ...) i_mmu (
    .clk_i, .rst_ni,
    .lsu_vaddr_i       (vaddr_i),
    .lsu_req_i         (lsu_valid_i),
    .lsu_is_store_i    (is_store),
    .lsu_paddr_o       (paddr),         // physical address out
    .lsu_valid_o       (translation_valid),
    .lsu_exception_o   (mmu_exception), // page fault / access fault
    // PTW interface for TLB misses
    .ptw_active_o, .walking_instr_o, ...
);

// ── STORE UNIT: holds store data until commit ─────────────────────────────
store_unit #(.CVA6Cfg(CVA6Cfg), ...) i_store_unit (
    .clk_i, .rst_ni,
    .flush_i,
    .valid_i           (store_valid),      // dispatch a new store
    .lsu_ctrl_i        (lsu_ctrl),         // {paddr, data, be, trans_id}
    .pop_st_i          (commit_i),         // commit_stage says "drain oldest"
    .commit_ready_o,
    .no_st_pending_o,
    // D-Cache write port
    .req_port_o        (dcache_req_ports_o[1]),
    .req_port_i        (dcache_req_ports_i[1]),
    // Forwarding output to load unit
    .store_buffer_valid_o  (st_buf_valid),
    .store_buffer_paddr_o  (st_buf_paddr),
    .store_buffer_data_o   (st_buf_data),
    .store_buffer_be_o     (st_buf_be)
);

// ── LOAD UNIT: handles cache reads with store-buffer forwarding ───────────
load_unit #(.CVA6Cfg(CVA6Cfg), ...) i_load_unit (
    .clk_i, .rst_ni,
    .valid_i           (load_valid),
    .lsu_ctrl_i        (lsu_ctrl),
    // Store buffer forwarding inputs
    .store_buffer_valid_i  (st_buf_valid),  // are there pending stores?
    .store_buffer_paddr_i  (st_buf_paddr),  // store buffer addresses
    .store_buffer_data_i   (st_buf_data),   // store buffer data
    .store_buffer_be_i     (st_buf_be),     // byte enables
    // D-Cache read port
    .req_port_o        (dcache_req_ports_o[0]),
    .req_port_i        (dcache_req_ports_i[0]),
    // Load result writeback
    .load_result_o, .load_valid_o, .load_trans_id_o, .load_exception_o
);

// ── FORWARDING CHECK (inside load_unit.sv) ───────────────────────────────
// If any store buffer entry has same paddr AND byte coverage: forward
logic forward_valid;
logic [CVA6Cfg.XLEN-1:0] forward_data;

always_comb begin : store_to_load_forward
  forward_valid = 1'b0;
  forward_data  = '0;
  for (int i = 0; i < DEPTH_ST_BUF; i++) begin
    if (st_buf_valid[i]
        && st_buf_paddr[i][CVA6Cfg.PLEN-1:3] == paddr[CVA6Cfg.PLEN-1:3] // same cache line
        && (st_buf_be[i] & load_be) == load_be) begin // store covers all load bytes
      forward_valid = 1'b1;
      forward_data  = st_buf_data[i]; // use store buffer data, not cache
    end
  end
end`
      }
    ],
    designDecisions: [
      "Stores go to the store buffer, NOT the cache. This is the fundamental rule. A store only reaches the cache after commit. Before that, it's speculative — a branch misprediction might mean the store should never have happened.",
      "Store-to-load forwarding is a correctness requirement, not an optimization. Without it, a load immediately following a store to the same address would read stale cache data. The load unit searches all store buffer entries on every access.",
      "The MMU is inside the LSU, not a separate pipeline stage. This means TLB lookup and AGU happen in parallel: the AGU computes the virtual address and feeds it to the TLB in the same cycle. The physical address is ready one cycle later (on TLB hit).",
      "Three separate D-cache ports (load/store/AMO) prevent head-of-line blocking. While a store buffer drain is writing to the cache on port 1, a new load can simultaneously access the cache on port 0. AMO operations on port 2 require exclusive access and block other ports.",
      "no_st_pending_o is needed for FENCE instructions. A FENCE.W must guarantee all previous stores are visible to subsequent loads — meaning the store buffer must be fully drained to the cache before the FENCE commits. The commit stage waits for no_st_pending_o=1 before allowing the FENCE to commit."
    ],
    relatedQuestions: ["l3-q3", "l2-q3", "l2-q5", "l4-q3", "l3-q4"]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LESSON 9: CSR REGISTER FILE
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "file-csr",
    stage: 9,
    category: "Privileged Architecture",
    title: "csr_regfile.sv — Control and Status Registers: The CPU's Operating System Interface",
    subtitle: "CVA6 core/csr_regfile.sv",
    difficulty: "advanced",
    duration: "12 min",
    summary: "The CSR file is how the OS controls the CPU. It holds privilege level, exception vectors, memory protection configuration, performance counters, and floating-point status. Understanding CSRs is mandatory for anyone writing OS or hypervisor code.",
    body: `The CSR (Control and Status Register) file is one of the most architecturally important but least-understood parts of a RISC-V CPU. It is the interface between the processor and the operating system — every trap, interrupt, context switch, and privilege transition goes through the CSR file.

WHAT THE CSR FILE CONTAINS:

MACHINE-MODE REGISTERS (M-mode, highest privilege):
  • mstatus: global interrupt enable (MIE), previous privilege (MPP), FP state (FS), etc.
  • mtvec: exception vector base address — where to jump on trap
  • mepc: exception PC — the instruction that caused the exception
  • mcause: exception cause code (12=load page fault, 8=U-mode ecall, etc.)
  • mtval: trap value — faulting address for memory faults, instruction bits for illegal instr
  • mie/mip: interrupt enable/pending bits (per interrupt source)
  • mscratch: scratch register for M-mode exception handlers
  • mhartid: this hart's ID in a multicore system
  • minstret, mcycle: performance counters (instructions retired, clock cycles)

SUPERVISOR-MODE REGISTERS (S-mode, for OS kernel):
  • sstatus, stvec, sepc, scause, stval: S-mode equivalents of the M-mode trap registers
  • satp: Supervisor Address Translation and Protection — holds the page table base address and ASID

FLOAT-POINT REGISTERS:
  • fcsr: floating-point control and status — rounding mode (frm) and exception flags (fflags)

HOW CSR INSTRUCTIONS WORK:

CVA6 handles CSR instructions in two steps:
  1. READ: in the execute stage, csr_addr_i (the 12-bit CSR address) is decoded and the current value is read out through csr_rdata_o. This read happens BEFORE commit.
  2. WRITE: at commit time, csr_op_i (CSRRW/CSRRS/CSRRC) is sent to the CSR file with csr_wdata_i. The write happens ONLY at commit — after the instruction is architecturally guaranteed to execute.

This two-step approach ensures: (1) the old value can be captured as the instruction's result (for CSRRS rd, csr, rs1: rd gets old value), (2) the write only happens if the instruction commits (no speculative CSR writes).

HOW EXCEPTIONS WORK (the trap sequence):

When commit_stage sees exception_o.valid=1:
  1. commit_stage outputs exception_o to csr_regfile.sv
  2. csr_regfile.sv handles the trap:
     a. Save PC to mepc (or sepc for S-mode exceptions)
     b. Save cause code to mcause (or scause)
     c. Save tval to mtval (or stval)
     d. Update mstatus: clear MIE (disable interrupts), save old privilege in MPP
     e. Switch privilege level to M-mode (or S-mode if exception delegates to S-mode)
     f. Output trap_vector_base_o → the frontend redirects PC here

  3. After the handler finishes, it executes MRET (or SRET):
     a. Restore privilege level from MPP (or SPP)
     b. Re-enable interrupts (set MIE from MPIE)
     c. Output epc_o (the saved mepc/sepc) → frontend redirects to the interrupted instruction
     d. Assert eret_o → the frontend knows this is a return, not a normal jump

EXCEPTION DELEGATION:
M-mode can delegate exceptions to S-mode via the medeleg CSR. When an exception occurs in U-mode and is delegated (e.g., U-mode page faults should be handled by the OS kernel), the trap goes to S-mode handlers (stvec, sepc, etc.) instead of M-mode. This allows the OS to handle most exceptions without involving the firmware.

INTERRUPT HANDLING:
Interrupts are different from exceptions — they're asynchronous. They're checked at instruction boundaries (in the decode stage, as we saw) using the irq_ctrl_t struct which contains mie, mip, and global enable status from the CSR file. When an interrupt fires, it looks exactly like an exception with an interrupt cause code (bit 63 of mcause set for interrupts).`,
    keySignals: [
      { name: "ex_i (exception_t)", direction: "input", explanation: "Exception from commit_stage. When valid=1, the CSR file executes the full trap sequence: save PC/cause/tval, update mstatus privilege bits, output trap vector." },
      { name: "csr_op_i / csr_wdata_i / csr_rdata_o", direction: "input/output", explanation: "CSR read/write interface. csr_rdata_o is driven by the CSR address decoded from the instruction. csr_wdata_i and csr_op_i arrive at commit time for the actual write." },
      { name: "epc_o / eret_o", direction: "output", explanation: "Exception return: epc_o is the saved PC (from mepc/sepc), eret_o pulses when MRET/SRET is committed. The frontend uses these to redirect PC back to the interrupted instruction." },
      { name: "trap_vector_base_o", direction: "output", explanation: "The exception handler entry point — from mtvec (M-mode) or stvec (S-mode). The frontend jumps here when an exception or interrupt is taken." },
      { name: "priv_lvl_o", direction: "output", explanation: "Current privilege level: M (3), S (1), U (0). Feeds into the decoder (for privilege checks on CSR access) and the MMU (for page table permission checks)." },
      { name: "irq_ctrl_o (irq_ctrl_t)", direction: "output", explanation: "Snapshot of interrupt control state: mie, mip, sie, global_enable. Sent to the decode stage every cycle so interrupt injection can happen at instruction boundaries." },
      { name: "flush_o", direction: "output", explanation: "When a CSR write changes a side-effecting register (mstatus, satp, mtvec), the pipeline must flush. flush_o triggers the controller to flush the pipeline and restart from the next PC." }
    ],
    snippets: [
      {
        label: "csr_regfile.sv — Trap sequence and mstatus update (actual CVA6 source logic)",
        language: "systemverilog",
        annotation: "This shows how CVA6 handles a trap: updating mepc/mcause/mstatus and outputting the trap vector. Every RISC-V OS relies on exactly this hardware behavior.",
        code: `// Copyright 2018 ETH Zurich — Florian Zaruba
// Source: core/csr_regfile.sv — trap handling logic (inside always_comb)

// ── TRAP HANDLING: triggered when commit_stage sees an exception ──────────
if (ex_i.valid) begin
  // STEP 1: Determine target privilege mode
  // If the exception is delegated (medeleg bit set for this cause), go to S-mode
  // Otherwise go to M-mode
  trap_to_priv_lvl = riscv::PRIV_LVL_M; // default: M-mode handles it
  if (CVA6Cfg.RVS) begin
    // Check if this cause is delegated to S-mode (medeleg/mideleg)
    if (is_irq) begin
      if (mideleg[ex_i.cause[CVA6Cfg.XLEN-2:0]])
        trap_to_priv_lvl = riscv::PRIV_LVL_S;
    end else begin
      if (medeleg[ex_i.cause[CVA6Cfg.XLEN-1:0]])
        trap_to_priv_lvl = riscv::PRIV_LVL_S;
    end
  end

  // STEP 2: Save architectural state for exception return
  if (trap_to_priv_lvl == riscv::PRIV_LVL_M) begin
    // M-mode trap: save to mepc/mcause/mtval
    mepc_n    = pc_i;               // Save faulting PC (for MRET return)
    mcause_n  = ex_i.cause;         // Exception cause code
    mtval_n   = ex_i.tval;          // Faulting address or instr bits
    // Update mstatus: save current privilege in MPP, disable interrupts (MIE→0)
    mstatus_n.mpie = mstatus_q.mie; // Save MIE as MPIE
    mstatus_n.mie  = 1'b0;          // Disable interrupts in handler
    mstatus_n.mpp  = priv_lvl_q;    // Save current privilege level
    priv_lvl_n     = riscv::PRIV_LVL_M; // Switch to M-mode
  end else begin
    // S-mode trap: save to sepc/scause/stval
    sepc_n    = pc_i;
    scause_n  = ex_i.cause;
    stval_n   = ex_i.tval;
    // Update sstatus
    mstatus_n.spie = mstatus_q.sie;
    mstatus_n.sie  = 1'b0;
    mstatus_n.spp  = priv_lvl_q[0]; // 1-bit SPP (was S or U)
    priv_lvl_n     = riscv::PRIV_LVL_S;
  end
end

// ── EXCEPTION RETURN (MRET/SRET) ─────────────────────────────────────────
if (mret) begin
  // M-mode return: restore privilege and interrupt enable from mstatus.MPP/MPIE
  priv_lvl_n     = riscv::priv_lvl_t'({1'b0, mstatus_q.mpp}); // restore privilege
  mstatus_n.mie  = mstatus_q.mpie; // re-enable interrupts
  mstatus_n.mpie = 1'b1;           // set MPIE to 1 (convention)
  mstatus_n.mpp  = riscv::PRIV_LVL_U; // reset MPP to U-mode
  eret_o         = 1'b1;           // → frontend: redirect to mepc
  epc_o          = mepc_q;         // the PC to return to
end

// ── TRAP VECTOR OUTPUT → Frontend ─────────────────────────────────────────
// trap_vector_base_o tells the frontend where the handler is
assign trap_vector_base_o = (trap_to_priv_lvl == riscv::PRIV_LVL_M)
                            ? mtvec_q[CVA6Cfg.VLEN-1:0]  // M-mode: use mtvec
                            : stvec_q[CVA6Cfg.VLEN-1:0]; // S-mode: use stvec`
      }
    ],
    designDecisions: [
      "CSR reads happen at execute time; CSR writes happen at commit time. This is critical for correctness: if you read and write in the same stage, you'd need to handle the case where the CSR instruction itself is on a speculative path. By separating them, reads are always safe (reading doesn't change state) and writes only happen when the instruction is architecturally committed.",
      "mstatus.MIE is cleared at the START of trap handling (before the handler begins). This prevents nested interrupts from preempting the handler unless the handler explicitly re-enables interrupts (sets MIE=1). Most OS exception handlers want to run with interrupts disabled by default.",
      "MPP (Machine Previous Privilege) in mstatus saves the privilege level at the time of the exception. MRET restores this. Without MPP, the CPU couldn't return to the correct privilege level after handling a U-mode trap in M-mode — it wouldn't know whether to return to U or S mode.",
      "flush_o is asserted when certain CSRs change. satp (page table base) changes invalidate the TLB — the pipeline must flush before new loads/stores use the new translation. mstatus changes to MXR/SUM (memory access permissions) also require a flush. The pipeline restart ensures no in-flight instructions use the stale MMU configuration.",
      "minstret (instructions retired counter) is incremented on every commit_ack_i. This is the architecturally-correct instruction count — it only increments when instructions actually commit, not when they execute speculatively. Operating systems use minstret via the rdinstret instruction to measure execution time."
    ],
    relatedQuestions: ["l3-q1", "l3-q3", "l2-q6", "l3-q4"]
  }
];

export const getLessonById = (id: string): Lesson | undefined =>
  lessons.find((l) => l.id === id);

export const getLessonsByStage = (): Lesson[] =>
  [...lessons].sort((a, b) => a.stage - b.stage);

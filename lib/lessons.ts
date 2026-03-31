export interface CodeSnippet {
  label: string;
  language: string;
  code: string;
  annotation: string; // line-by-line explanation
}

export interface Lesson {
  id: string;
  stage: number;       // pipeline stage order: 1=frontend, 2=decode, 3=issue, 4=execute, 5=memory, 6=commit
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

export const lessons: Lesson[] = [
  // ─── STAGE 1: FRONTEND (Fetch) ───────────────────────────────────────────
  {
    id: "stage-01-frontend",
    stage: 1,
    category: "Frontend",
    title: "Stage 1 — Frontend: Instruction Fetch",
    subtitle: "CVA6 core/frontend/frontend.sv",
    difficulty: "beginner",
    duration: "10 min",
    summary: "The frontend is the CPU's eyes — it fetches instructions from the I-cache, predicts branches, and feeds a stream of instructions to the decode stage. Everything downstream depends on getting this right.",
    body: `The frontend module in CVA6 is the first real hardware the program counter (PC) touches. Its job sounds simple: read the instruction at the current PC from the instruction cache and pass it downstream. In reality, it orchestrates branch prediction, handles PC redirection from exceptions and mispredictions, manages cache request/response handshakes, and deals with compressed (16-bit) RISC-V instructions that complicate alignment.

WHAT THE FRONTEND DOES (in order every cycle):

1. GENERATE NEXT PC: The PC selection mux has multiple sources in priority order:
   — Exception/trap vector (highest priority: exception_o redirects here)
   — ERET (return from exception) — uses epc_i
   — Misprediction correction — uses resolved_branch_i.target_address
   — Fence/CSR side-effect — uses pc_commit_i
   — Branch predictor — predicted next PC
   — PC+4 (default: no branch predicted)
   This priority chain means if multiple events happen simultaneously, the most critical wins.

2. ISSUE I-CACHE REQUEST: The PC is sent to the instruction cache via icache_dreq_o. The cache returns icache_dreq_i with the instruction word (or a miss signal). CVA6 uses a physically-tagged instruction cache, so there's a TLB lookup before the physical cache access.

3. BRANCH PREDICTION: The BHT (Branch History Table) and BTB (Branch Target Buffer) are consulted with the current PC to predict whether the next instruction is a branch and where it goes. Prediction happens speculatively before knowing what the instruction actually is.

4. INSTRUCTION ALIGNMENT: RISC-V supports compressed (C extension) 16-bit instructions. The frontend handles the case where a 32-bit instruction crosses a 64-byte cache line boundary — it must stitch two cache responses together.

5. HANDSHAKE TO DECODE: The output is fetch_entry_o[], a ready/valid handshake. Each entry carries the instruction word, its PC, the predicted next PC, any fetch exceptions (page fault, access fault), and validity. The decode stage pulls from this when it's ready — if it's stalled, the frontend backs off.

KEY INPUTS THE FRONTEND RESPONDS TO:
— flush_i: squash everything in-flight (branch mispredict recovery, fence)
— halt_i: stop fetching (WFI instruction, debug halt)
— resolved_branch_i: the execution stage reports the actual branch outcome; if mispredicted, redirect PC here
— set_pc_commit_i + pc_commit_i: after a CSR write with side effects, restart from the commit PC
— eret_i + epc_i: return from exception handler

The frontend is stateless in one sense — it has no architectural state. But it has significant microarchitectural state: the BHT tables, BTB, return address stack (RAS), and the fetch queue between I-cache and decode. A pipeline flush clears the fetch queue and restarts the BHT speculation from the corrected PC.`,
    keySignals: [
      { name: "boot_addr_i", direction: "input", explanation: "The PC on reset — where the CPU starts executing. Typically 0x80000000 for RISC-V DRAM boot or 0x00010000 for ROM." },
      { name: "flush_i", direction: "input", explanation: "Flush the entire frontend pipeline. Asserted on branch misprediction, fence.i, and exceptions. Causes the fetch queue to drain and BHT speculation to restart from the correct PC." },
      { name: "resolved_branch_i", direction: "input", explanation: "From the execute stage: the actual branch outcome and target. If it differs from the prediction, flush_i is also asserted and the frontend redirects to the correct PC." },
      { name: "icache_dreq_o", direction: "output", explanation: "The I-cache request: contains the virtual PC to fetch from. Follows a valid/ready handshake — the frontend asserts valid, the cache asserts ready when it can accept the request." },
      { name: "icache_dreq_i", direction: "input", explanation: "The I-cache response: contains the instruction word, validity, and any cache exception (page fault). May be stale if the PC changed since the request." },
      { name: "fetch_entry_o", direction: "output", explanation: "The fetch bundle sent to decode: instruction word, PC, predicted next PC, exception flags. One entry per issue port (CVA6 supports 1 or 2-wide issue)." },
      { name: "fetch_entry_ready_i", direction: "input", explanation: "Backpressure from the decode stage. When decode stalls (e.g., issue queue full), it deasserts ready, causing the frontend to hold its output." }
    ],
    snippets: [
      {
        label: "CVA6 frontend.sv — Module Port Declaration (actual source)",
        language: "systemverilog",
        annotation: "Read every port. Each signal tells a story about what can redirect the PC.",
        code: `module frontend
  import ariane_pkg::*;
#(
    parameter config_pkg::cva6_cfg_t CVA6Cfg = config_pkg::cva6_cfg_empty,
    parameter type fetch_entry_t    = logic,
    parameter type icache_dreq_t    = logic,
    parameter type icache_drsp_t    = logic
) (
    input  logic                        clk_i,
    input  logic                        rst_ni,
    input  logic [CVA6Cfg.VLEN-1:0]     boot_addr_i,      // PC on reset

    // PC redirection sources (priority: highest first)
    input  logic                        flush_bp_i,        // Flush branch predictor state
    input  logic                        flush_i,           // Full frontend flush
    input  logic                        halt_i,            // Stop fetching (WFI/debug)
    input  logic                        halt_frontend_i,   // Hold fetch for fence.i
    input  logic                        set_pc_commit_i,   // Use commit PC (CSR side effect)
    input  logic [CVA6Cfg.VLEN-1:0]     pc_commit_i,       // Commit stage PC
    input  logic                        ex_valid_i,        // Exception occurred
    input  bp_resolve_t                 resolved_branch_i, // Branch resolved in EX stage
    input  logic                        eret_i,            // Return from exception
    input  logic [CVA6Cfg.VLEN-1:0]     epc_i,             // Exception return PC
    input  logic [CVA6Cfg.VLEN-1:0]     trap_vector_base_i,// Exception handler base
    input  logic                        set_debug_pc_i,    // Debug redirect
    input  logic                        debug_mode_i,      // CPU in debug mode

    // I-Cache interface (valid/ready handshake)
    output icache_dreq_t                icache_dreq_o,     // Request to I-cache
    input  icache_drsp_t                icache_dreq_i,     // Response from I-cache

    // Handshake to Decode stage (valid/ready)
    output fetch_entry_t [CVA6Cfg.NrIssuePorts-1:0] fetch_entry_o,
    output logic         [CVA6Cfg.NrIssuePorts-1:0] fetch_entry_valid_o,
    input  logic         [CVA6Cfg.NrIssuePorts-1:0] fetch_entry_ready_i
);`
      }
    ],
    designDecisions: [
      "CVA6 uses a decoupled fetch queue (FIFO) between the I-cache response and the decode stage. This absorbs I-cache latency variation without stalling decode when cache hits arrive.",
      "The resolved_branch_i signal comes from the execute stage — not from a separate branch unit. This means the branch resolution latency is the full EX stage depth, not a shortened path.",
      "NrIssuePorts is a compile-time parameter. CVA6 can be configured as 1-wide or 2-wide issue by changing this parameter — the fetch stage fetches 1 or 2 instructions per cycle accordingly.",
      "halt_frontend_i (separate from halt_i) is needed for fence.i: the frontend must stop before the cache flush happens, but the pipeline drains normally. Two separate halt signals give the controller precise control.",
      "The BHT and BTB are inside the frontend module, not separate modules. This keeps the prediction logic tightly coupled with the PC generation mux, minimizing critical path length."
    ],
    relatedQuestions: ["l3-q2", "l2-q1", "l1-q5"]
  },

  // ─── STAGE 2: DECODE / ID STAGE ──────────────────────────────────────────
  {
    id: "stage-02-decode",
    stage: 2,
    category: "Decode",
    title: "Stage 2 — Decode: Instruction Decode & Issue",
    subtitle: "CVA6 core/id_stage.sv",
    difficulty: "beginner",
    duration: "9 min",
    summary: "Decode cracks open the 32-bit instruction word and figures out what it means: which functional unit runs it, which registers it reads and writes, what immediate value it contains. This is where RISC-V ISA encoding meets hardware.",
    body: `The decode stage takes the raw instruction bits from the frontend and converts them into a structured description of the operation: what to do, with what operands, producing what result, to which register. In CVA6, this structured description is a scoreboard_entry_t — a hardware record that travels with the instruction through the rest of the pipeline.

WHAT DECODE DOES:

1. OPCODE DECODE: RISC-V instructions encode the operation in the opcode field [6:0], funct3 [14:12], and funct7 [31:25]. The decoder is a large combinational block that maps these bit patterns to an internal operation enum (ADD, SUB, LOAD, STORE, BRANCH, JAL, CSR, etc.). For illegal instructions, it generates an illegal_instr exception.

2. REGISTER ADDRESS EXTRACTION: rs1 = inst[19:15], rs2 = inst[24:20], rd = inst[11:7]. These are direct bit fields in the instruction — no computation needed. The decoder also determines which source registers are actually used (some instructions only use rs1, not rs2).

3. IMMEDIATE EXTRACTION: RISC-V has 6 immediate formats (I, S, B, U, J, and CSR). Each format packs the immediate bits in different locations to minimize the hardware cost of the register file read ports. The decoder reassembles and sign-extends the immediate into a 64-bit value.

4. FUNCTIONAL UNIT ASSIGNMENT: Each instruction goes to one functional unit: ALU (arithmetic/logic), Branch Unit (conditional branches, JAL, JALR), Load-Store Unit (LOAD/STORE), Multiply-Divide Unit (MUL/DIV), CSR Unit (system instructions), FPU (floating point if enabled). This assignment determines which reservation station the instruction waits in.

5. HAZARD DETECTION: In CVA6's scoreboard-based issue, the decode stage checks if the destination register of this instruction aliases with any in-flight instruction. If so, it stalls until the scoreboard clears the dependency.

6. COMPRESSED INSTRUCTION EXPANSION: If the C extension is enabled, 16-bit compressed instructions are expanded to their 32-bit equivalents here. The expansion is a combinational mapping — there's a 1:1 correspondence between each C.* instruction and its RV32/RV64 equivalent.

The output, scoreboard_entry_t, is the lingua franca of the CVA6 backend. It contains: pc, instruction word, operation type, functional unit, immediate, source/destination register addresses, exception information, and metadata flags (is_compressed, uses_fp, etc.). This struct flows from decode through issue, execute, and is finally consumed by commit.

One subtle point: CVA6's id_stage also handles the issue side — reading operands from the register file and forwarding in-flight results. The name "id_stage" is slightly misleading; it really covers both Decode (D) and Operand Read (O) in a more traditional pipeline nomenclature.`,
    keySignals: [
      { name: "fetch_entry_i", direction: "input", explanation: "Raw instruction bundle from the frontend: instruction bits, PC, predicted next PC, fetch exceptions." },
      { name: "fetch_entry_valid_i", direction: "input", explanation: "Frontend asserts this when fetch_entry_i holds a valid instruction. Decode must not consume the entry without this being asserted." },
      { name: "fetch_entry_ready_o", direction: "output", explanation: "Decode asserts this when it can accept a new instruction. Deasserted when the scoreboard is full or a structural hazard is detected." },
      { name: "issue_entry_o", direction: "output", explanation: "The decoded scoreboard_entry_t: fully decoded instruction with all fields populated, ready for the issue stage / scoreboard." },
      { name: "issue_entry_valid_o", direction: "output", explanation: "Indicates issue_entry_o holds a valid decoded instruction ready for the issue stage." },
      { name: "flush_i", direction: "input", explanation: "Clears any instruction currently being decoded. Used on branch misprediction and exception recovery." }
    ],
    snippets: [
      {
        label: "CVA6 id_stage.sv — Module Port Declaration (actual source)",
        language: "systemverilog",
        annotation: "Notice how id_stage connects to both the frontend (upstream) and the issue/scoreboard (downstream).",
        code: `module id_stage #(
    parameter config_pkg::cva6_cfg_t CVA6Cfg = config_pkg::cva6_cfg_empty,
    parameter type branchpredict_sbe_t  = logic,
    parameter type exception_t          = logic,
    parameter type fetch_entry_t        = logic,
    parameter type scoreboard_entry_t   = logic  // OUTPUT: decoded instruction
) (
    input  logic   clk_i,
    input  logic   rst_ni,
    input  logic   flush_i,         // Squash instruction in-flight
    input  logic   debug_req_i,     // Debug: may redirect to debug ROM

    // === Upstream: from Frontend ===
    input  fetch_entry_t [CVA6Cfg.NrIssuePorts-1:0] fetch_entry_i,
    input  logic         [CVA6Cfg.NrIssuePorts-1:0] fetch_entry_valid_i,
    output logic         [CVA6Cfg.NrIssuePorts-1:0] fetch_entry_ready_o,

    // === Downstream: to Issue Stage / Scoreboard ===
    output scoreboard_entry_t [CVA6Cfg.NrIssuePorts-1:0] issue_entry_o,
    output logic              [CVA6Cfg.NrIssuePorts-1:0] issue_entry_valid_o,
    output logic              [CVA6Cfg.NrIssuePorts-1:0] is_ctrl_flow_o, // is branch/jump?
    input  logic              [CVA6Cfg.NrIssuePorts-1:0] issue_instr_ack_i,

    // === Interrupt/exception interface ===
    input  irq_ctrl_t          irq_ctrl_i,     // Pending interrupts
    input  logic               tvm_i,          // Trap Virtual Memory (M-mode CSR)
    input  logic               tw_i,           // Timeout Wait
    input  logic               tsr_i           // Trap SRET
);
// Inside: decoder sub-module maps instruction bits → scoreboard_entry_t
// scoreboard_entry_t fields include:
//   pc, instruction, op (operation enum), fu (functional unit enum),
//   rs1, rs2, rd, result (immediate or 0), use_imm, use_zimm,
//   is_compressed, ex (exception struct: valid, cause, tval)`
      }
    ],
    designDecisions: [
      "CVA6 uses a parameterized scoreboard_entry_t struct as the universal instruction descriptor. This single struct flows through the entire backend — decode populates it, issue reads it, execute updates the result field, commit consumes it. One struct, one truth.",
      "Compressed instruction expansion happens in decode, not in the frontend. This means the frontend always presents 32-bit aligned instruction words; decode handles the variable-length complexity. Simpler frontend, slightly more complex decode.",
      "The illegal instruction check is complete in decode: if no valid RISC-V encoding matches the bit pattern, the instruction becomes an exception-carrying NOP. It flows through the pipeline normally and commits as an exception — maintaining precise exception semantics without special-casing the pipeline.",
      "irq_ctrl_i feeds directly into decode. Interrupts in RISC-V are taken at instruction boundaries — the decode stage checks pending interrupts before each instruction and injects a special 'interrupt' scoreboard entry if an interrupt should be taken now.",
      "is_ctrl_flow_o is a separate output (not inside scoreboard_entry_t) because the frontend needs to know immediately if it's processing a branch/jump to update the branch predictor state — before the full decode is used downstream."
    ],
    relatedQuestions: ["l1-q2", "l1-q6", "l1-q7", "l1-q8"]
  },

  // ─── STAGE 3: ISSUE / SCOREBOARD ─────────────────────────────────────────
  {
    id: "stage-03-issue",
    stage: 3,
    category: "Issue & Scoreboard",
    title: "Stage 3 — Issue: Scoreboard & Out-of-Order Dispatch",
    subtitle: "CVA6 core/issue_stage.sv + scoreboard.sv",
    difficulty: "intermediate",
    duration: "11 min",
    summary: "The issue stage is CVA6's out-of-order heart. It tracks all in-flight instructions via a scoreboard, reads register file operands, handles forwarding, and dispatches instructions to functional units as soon as their dependencies are resolved.",
    body: `CVA6 is a partially out-of-order processor. Instructions enter the issue stage in order, but they can be dispatched to functional units out-of-order if their operands are ready and the target functional unit is free. The scoreboard is the tracking mechanism that makes this safe.

WHAT THE SCOREBOARD IS:
A scoreboard is a table of in-flight instructions, each with a "result valid" bit. When an instruction is dispatched to a functional unit, it gets a scoreboard entry. When the functional unit completes, it writes the result back to the scoreboard and sets the result-valid bit. An instruction waiting for a result from an earlier instruction (RAW dependency) checks the scoreboard — if the producing instruction's result-valid bit is set, the waiting instruction can proceed.

CVA6 uses a simplified scoreboard compared to Tomasulo's full algorithm. It tracks which physical registers have pending writes, and stalls any instruction that reads a register with a pending write. This is more conservative than Tomasulo (it may stall unnecessarily if two instructions write different registers that hash to the same tracking entry) but much simpler to implement.

OPERAND READ AND FORWARDING:
When an instruction is issued from the scoreboard, it reads its source operands (rs1, rs2) from the register file. But if an in-flight instruction is about to produce the value that rs1 needs, the scoreboard must forward that value instead. CVA6 checks:
1. Is there a result on the functional unit's output bus right now that matches rs1? → Forward from writeback bus
2. Is there a completed result in the scoreboard that matches rs1? → Forward from scoreboard
3. Otherwise → use register file value

FUNCTIONAL UNIT DISPATCH:
Each functional unit (ALU, BU, LSU, MUL, CSR, FPU) has a valid/ready interface. The issue stage asserts valid to a unit when an instruction is ready to execute. The unit asserts ready when it can accept work. CVA6's ALU is fully pipelined (accepts every cycle). The MUL/DIV unit may take multiple cycles. The LSU handles memory ordering. Only one instruction per functional unit can be in-flight at a time in CVA6's design.

IN-ORDER COMMIT CONSTRAINT:
Even though instructions execute out-of-order, they must commit in-order. The scoreboard maintains a "commit pointer" that advances only when the oldest in-flight instruction's result is valid. This is the ROB (Reorder Buffer) concept — CVA6's scoreboard serves as a lightweight ROB. When the head entry has a valid result and no exception, it's presented to the commit stage.

STALL CONDITIONS:
The issue stage stalls when:
- Scoreboard is full (all entries occupied by in-flight instructions)
- A required functional unit is busy (structural hazard)
- A source register has a pending write (RAW dependency, non-forwarded)
- A CSR instruction is encountered (CVA6 serializes CSR access for correctness)`,
    keySignals: [
      { name: "decoded_instr_i", direction: "input", explanation: "scoreboard_entry_t from decode: the fully decoded instruction ready to enter the scoreboard." },
      { name: "rs1_forwarding_o", direction: "output", explanation: "Forwarded value for source register 1 — either from the register file or from a completing functional unit. Sent to execute stage." },
      { name: "rs2_forwarding_o", direction: "output", explanation: "Forwarded value for source register 2. Same forwarding logic as rs1." },
      { name: "fu_data_o", direction: "output", explanation: "The fully-operand-resolved instruction bundle dispatched to the functional units. Contains the operation, both operand values (possibly forwarded), and the scoreboard tag." },
      { name: "commit_instr_o", direction: "output", explanation: "The head of the scoreboard — the oldest in-flight instruction. Presented to commit stage when result is valid. Commit stage acks when it commits, freeing the scoreboard entry." },
      { name: "wb_*", direction: "input", explanation: "Writeback buses from all functional units. When a unit finishes, it broadcasts its tag + result here. The scoreboard captures this and marks the entry as complete." }
    ],
    snippets: [
      {
        label: "CVA6 Scoreboard — Key Concepts in Simplified RTL",
        language: "systemverilog",
        annotation: "This shows the core tracking logic — not verbatim CVA6 code but faithful to its architecture.",
        code: `// Simplified CVA6-style scoreboard
// Tracks in-flight instructions and enables out-of-order completion

typedef struct packed {
  scoreboard_entry_t  sbe;         // Decoded instruction
  logic [XLEN-1:0]    result;      // Written by functional unit on completion
  logic               issued;      // Dispatched to functional unit
  logic               result_valid;// Functional unit has written result
  logic               valid;       // Entry is occupied
} sb_slot_t;

sb_slot_t [SB_DEPTH-1:0] sb;
logic [$clog2(SB_DEPTH)-1:0] issue_ptr;   // Next empty slot
logic [$clog2(SB_DEPTH)-1:0] commit_ptr;  // Oldest instruction (head)

// ISSUE: allocate scoreboard entry when decode presents new instruction
always_ff @(posedge clk_i) begin
  if (issue_valid && !sb_full) begin
    sb[issue_ptr].sbe          <= decoded_instr_i;
    sb[issue_ptr].valid        <= 1'b1;
    sb[issue_ptr].issued       <= 1'b0;
    sb[issue_ptr].result_valid <= 1'b0;
    issue_ptr <= issue_ptr + 1;
  end
end

// WRITEBACK: when a FU completes, find its scoreboard entry and record result
always_ff @(posedge clk_i) begin
  for (int i = 0; i < SB_DEPTH; i++) begin
    if (sb[i].valid && wb_valid_i && sb[i].sbe.trans_id == wb_trans_id_i) begin
      sb[i].result       <= wb_result_i;
      sb[i].result_valid <= 1'b1;
    end
  end
end

// COMMIT: present head entry to commit stage when result is ready
assign commit_instr_o       = sb[commit_ptr].sbe;
assign commit_instr_valid_o = sb[commit_ptr].valid && sb[commit_ptr].result_valid;

// FORWARDING: check if rs1 matches any completing writeback
always_comb begin
  rs1_fwd = regfile_rs1; // default: use register file
  for (int i = 0; i < SB_DEPTH; i++) begin
    if (sb[i].valid && sb[i].result_valid && sb[i].sbe.rd == rs1_addr)
      rs1_fwd = sb[i].result; // Forward completed result
  end
  // Also check live writeback bus (result arriving this cycle)
  if (wb_valid_i && wb_rd_i == rs1_addr)
    rs1_fwd = wb_result_i;
end`
      }
    ],
    designDecisions: [
      "CVA6's scoreboard is register-indexed (tracks pending writes per register), not a full Tomasulo reservation station. Simpler hardware, slightly more conservative stalling — acceptable for a research/embedded core.",
      "trans_id: every instruction gets a unique transaction ID when it enters the scoreboard. Functional units use this ID to route their result back to the correct scoreboard entry — there's no need to match on register address at writeback time.",
      "CVA6 commits up to NrCommitPorts instructions per cycle (configurable). The commit logic checks that the head N entries of the scoreboard all have valid results before committing them as a group.",
      "CSR instructions are serialized — the issue stage stalls all other instructions until a CSR instruction commits. This ensures CSR side effects (changing privilege level, disabling interrupts) are visible to subsequent instructions without complex reasoning about ordering.",
      "The scoreboard also handles the ROB function: it maintains in-order tracking for precise exception support. If the head entry has an exception flag set, the commit stage takes the exception rather than committing the instruction."
    ],
    relatedQuestions: ["l3-q1", "l2-q1", "l3-q5", "l1-q3"]
  },

  // ─── STAGE 4: EXECUTE ─────────────────────────────────────────────────────
  {
    id: "stage-04-execute",
    stage: 4,
    category: "Execute",
    title: "Stage 4 — Execute: ALU, Branch Unit & Load-Store Unit",
    subtitle: "CVA6 core/ex_stage.sv",
    difficulty: "intermediate",
    duration: "10 min",
    summary: "The execute stage is where instructions actually do work: the ALU computes, the branch unit resolves direction and target, and the LSU begins the memory access sequence. All functional units run in parallel.",
    body: `The execute stage (ex_stage.sv in CVA6) is an orchestrator — it instantiates all the functional units and routes instructions from the issue stage to the appropriate unit, then collects results and routes them back to the scoreboard writeback buses.

FUNCTIONAL UNITS IN CVA6'S EXECUTE STAGE:

ALU (Arithmetic-Logic Unit): Handles all integer arithmetic (ADD, SUB, AND, OR, XOR, shifts), comparisons (SLT, SLTU), and LUI/AUIPC. Fully combinational — result is ready the same cycle the instruction is dispatched. No pipeline registers inside the ALU itself in CVA6's base configuration. This means the ALU result can be forwarded to the NEXT instruction without any latency.

Branch Unit (BU): Handles conditional branches (BEQ, BNE, BLT, BGE, BLTU, BGEU), JAL, and JALR. The BU computes the branch condition (same logic as ALU compare), computes the actual target PC (base + offset, or rs1 + offset for JALR), compares with the predicted target from the frontend, and signals resolved_branch_o back to the frontend. If the prediction was wrong — wrong direction or wrong target — it raises a misprediction flush.

Load-Store Unit (LSU): The most complex functional unit. Handles all LOAD and STORE instructions. Steps:
  1. Address generation: rs1 + sign_extended_imm (done in EX stage, this cycle)
  2. TLB lookup: virtual → physical address translation (1–2 cycles if TLB hits)
  3. D-cache access: read or write (1 cycle on hit, many cycles on miss)
  4. Data alignment: extracted byte/halfword/word from the 64-bit cache line
The LSU has its own internal pipeline and may take 3–50+ cycles depending on cache behavior. It interacts with the D-cache via dcache_req_o/dcache_req_i handshake interfaces.

Multiply-Divide Unit (MDU): Handles MUL, MULH, DIV, DIVU, REM, REMU. Multiply typically takes 2–3 cycles (Booth's algorithm). Division is iterative — 32–64 cycles for long division. The MDU stalls the issue stage while in progress.

CSR Unit: Handles system instructions (CSRRW, CSRRS, ECALL, EBREAK, MRET, SRET, WFI, FENCE). These interact with the privilege controller and CSR register file.

FORWARDING FROM EX TO ISSUE:
The execute stage outputs rs1_forwarding_o and rs2_forwarding_o back to the issue stage. These carry the ALU result from the current cycle, enabling the issue stage to forward to the NEXT instruction's operands without going through the register file or scoreboard.

BRANCH MISPREDICTION:
When resolved_branch_o.is_mispredict is asserted, the controller module asserts flush_i to the frontend and kills all instructions younger than the mispredicted branch in the scoreboard. The frontend restarts from resolved_branch_o.target_address.`,
    keySignals: [
      { name: "fu_data_i", direction: "input", explanation: "The instruction bundle from issue: operation type, operand A (rs1 value or forwarded), operand B (rs2 value, immediate, or forwarded), transaction ID, destination register." },
      { name: "rs1_forwarding_i / rs2_forwarding_i", direction: "input", explanation: "Forwarded operand values from the issue stage's scoreboard scan. The execute stage receives pre-resolved operands — it does not do its own forwarding lookup." },
      { name: "resolved_branch_o", direction: "output", explanation: "Branch resolution result: actual target PC, actual direction (taken/not-taken), whether it was mispredicted, the original predicted PC. Frontend and controller consume this." },
      { name: "alu_result_ex_id_o", direction: "output", explanation: "ALU result forwarded directly back to the issue stage for back-to-back ALU→ALU forwarding. This is the critical 1-cycle forwarding path." },
      { name: "dcache_req_o", direction: "output", explanation: "Load/store request to the D-cache: physical address (post-TLB), operation (read/write), data (for stores), size. Uses a valid/ready handshake." },
      { name: "dcache_req_i", direction: "input", explanation: "D-cache response: data (for loads), valid/miss indicator. On a miss, the cache fetches the line from L2 and asserts valid when data is ready." }
    ],
    snippets: [
      {
        label: "CVA6 ex_stage.sv — Module Port Declaration (actual source)",
        language: "systemverilog",
        annotation: "Every functional unit has its own valid/ready dispatch port. Notice rs1/rs2 forwarding both IN (from issue) and OUT (ALU result back to issue).",
        code: `module ex_stage
  import ariane_pkg::*;
#(
    parameter config_pkg::cva6_cfg_t CVA6Cfg = config_pkg::cva6_cfg_empty,
    parameter type bp_resolve_t   = logic,
    parameter type fu_data_t      = logic,
    parameter type dcache_req_i_t = logic,
    parameter type dcache_req_o_t = logic
) (
    input  logic   clk_i,
    input  logic   rst_ni,
    input  logic   flush_i,

    // === Forwarded operands from Issue stage ===
    input  logic [CVA6Cfg.NrIssuePorts-1:0][CVA6Cfg.VLEN-1:0] rs1_forwarding_i,
    input  logic [CVA6Cfg.NrIssuePorts-1:0][CVA6Cfg.VLEN-1:0] rs2_forwarding_i,

    // === Instruction dispatch to functional units ===
    input  fu_data_t [CVA6Cfg.NrIssuePorts-1:0]  fu_data_i,  // Op + operands
    input  logic     [CVA6Cfg.NrIssuePorts-1:0]  alu_valid_i, // Dispatch to ALU
    output logic     [CVA6Cfg.NrIssuePorts-1:0]  alu_ready_o, // ALU ready
    input  logic                                  lsu_valid_i, // Dispatch to LSU
    output logic                                  lsu_ready_o, // LSU ready
    input  logic                                  mult_valid_i,// Dispatch to MUL
    output logic                                  mult_ready_o,

    // === ALU → Issue back-forwarding (critical path!) ===
    output logic [CVA6Cfg.NrIssuePorts-1:0][CVA6Cfg.XLEN-1:0] alu_result_ex_id_o,

    // === Branch resolution → Frontend ===
    output bp_resolve_t    resolved_branch_o, // Actual branch outcome

    // === LSU → D-Cache ===
    output dcache_req_o_t  dcache_req_ports_o [3], // 3 LSU ports: load, store, amo
    input  dcache_req_i_t  dcache_req_ports_i [3],

    // === Writeback to Scoreboard ===
    output logic [CVA6Cfg.NrIssuePorts-1:0]           wbdata_valid_o,
    output logic [CVA6Cfg.NrIssuePorts-1:0][XLEN-1:0] wbdata_o,
    output logic [CVA6Cfg.NrIssuePorts-1:0][TRANS_ID_BITS-1:0] wbdata_trans_id_o
);`
      }
    ],
    designDecisions: [
      "The ALU is combinational (0-cycle latency) in CVA6. This is a deliberate choice for a mid-range core: it simplifies forwarding (no pipeline registers to navigate) at the cost of a potentially longer critical path through the ALU.",
      "Three D-cache ports (load, store, AMO) allow the LSU to handle concurrent load and store requests. In practice, load-after-store ordering is enforced by the LSU's internal store buffer — loads check the store buffer before going to cache.",
      "resolved_branch_o goes directly to the frontend, bypassing the commit stage. Branch misprediction recovery is handled speculatively — no need to wait for the branch to commit before redirecting the PC.",
      "The fu_data_t struct carries a trans_id field (transaction ID). When the functional unit writes back its result, it includes the trans_id so the scoreboard can find the right entry. This decouples writeback routing from register addresses.",
      "alu_valid_i is one bit per issue port — in 2-wide CVA6, two ALU instructions can be dispatched simultaneously to two parallel ALU instances inside ex_stage."
    ],
    relatedQuestions: ["l2-q1", "l1-q4", "l3-q3", "l2-q3"]
  },

  // ─── STAGE 5: COMMIT ──────────────────────────────────────────────────────
  {
    id: "stage-05-commit",
    stage: 5,
    category: "Commit",
    title: "Stage 5 — Commit: Architectural State Update",
    subtitle: "CVA6 core/commit_stage.sv",
    difficulty: "intermediate",
    duration: "10 min",
    summary: "Commit is where speculation ends and reality begins. Only here are results written to the architectural register file, stores sent to cache, and exceptions taken. Everything before this point is reversible.",
    body: `The commit stage is the last guardian of architectural correctness. An instruction that reaches the commit stage has executed, produced a result, and is the oldest in-flight instruction in the scoreboard. At this point, the CPU must decide: commit the instruction's effects to architectural state, or signal an exception and redirect to the handler.

THE COMMIT STAGE PERFORMS:

1. REGISTER FILE WRITE: For integer instructions, the result from the scoreboard entry is written to the register file at the destination address (waddr_o, wdata_o, we_gpr_o). This is the moment the architectural register is updated. Before this, the result only exists in the scoreboard.

2. STORE COMMIT: Stores don't write to the D-cache during execute — they write to a store buffer. The commit stage signals the LSU to drain the store buffer entry to the actual cache. This ensures stores only become visible to other cores after the instruction has committed (fundamental to memory consistency).

3. EXCEPTION HANDLING: If the scoreboard head entry has an exception (ex.valid = 1), the commit stage:
   — Does NOT write any register or commit any store
   — Asserts exception_o with the cause and tval (trap value)
   — The controller responds by saving the exception PC to mepc/sepc, setting the cause in mcause/scause, and redirecting the frontend to the trap vector
   — All younger instructions in the scoreboard are squashed

4. CSR UPDATES: CSR-type instructions (CSRRW, etc.) update the CSR register file at commit time. This includes privilege-changing instructions (MRET, SRET) which modify the privilege level and return-from-exception PC.

5. INTERRUPT INJECTION: Pending external interrupts are taken at commit boundaries. If an interrupt is pending and enabled, the commit stage injects an exception with the appropriate interrupt cause code.

6. FLOATING POINT STATE: When FP instructions commit, dirty_fp_state_o is asserted to update the FS field in the mstatus CSR. This signals to the OS that FP registers have been modified and must be saved on context switch.

WHY IN-ORDER COMMIT MATTERS FOR PRECISE EXCEPTIONS:
Imagine a load instruction causes a page fault, but a branch instruction that executed earlier (and completed) was actually mispredicted — the load should never have executed. With in-order commit, the branch's misprediction is detected before the load reaches the commit stage (younger instructions can't commit before older ones), so the load's page fault is never reported. Without in-order commit, you'd report an exception for an instruction that "shouldn't have run" — catastrophically wrong.

COMMIT RATE:
CVA6 commits NrCommitPorts instructions per cycle (typically 1 or 2). The bottleneck is usually the scoreboard head — if the oldest instruction is a long-latency divide or a cache miss, commit stalls entirely until it completes. This is the "head-of-line blocking" problem in in-order commit, and a key motivation for larger ROBs in high-performance designs.`,
    keySignals: [
      { name: "commit_instr_i", direction: "input", explanation: "The NrCommitPorts oldest scoreboard entries — candidates for commit. Provided by the issue/scoreboard stage." },
      { name: "commit_ack_o", direction: "output", explanation: "Acknowledge that the instruction at port N is being committed this cycle. This frees the scoreboard entry." },
      { name: "waddr_o / wdata_o / we_gpr_o", direction: "output", explanation: "Register file write: address, data, and write-enable. This is the only place the architectural register file is updated." },
      { name: "exception_o", direction: "output", explanation: "Exception bundle: valid bit, cause code, tval (faulting address or instruction bits). Consumed by the controller to initiate exception handling." },
      { name: "commit_lsu_o", direction: "output", explanation: "Signal to the LSU to drain the head store buffer entry to cache. Only asserted when a STORE instruction commits." },
      { name: "dirty_fp_state_o", direction: "output", explanation: "Asserted when an FP instruction commits — tells the CSR file to set mstatus.FS = Dirty, indicating the OS must save FP registers on context switch." },
      { name: "single_step_i", direction: "input", explanation: "Debug single-step mode. When set, the commit stage takes a debug exception after committing exactly one instruction, transferring control to the debugger." }
    ],
    snippets: [
      {
        label: "CVA6 commit_stage.sv — Module Port Declaration (actual source)",
        language: "systemverilog",
        annotation: "Notice how every architectural side effect (regfile write, store drain, CSR update, exception) goes through commit_stage. Nothing bypasses it.",
        code: `module commit_stage
  import ariane_pkg::*;
#(
    parameter config_pkg::cva6_cfg_t CVA6Cfg = config_pkg::cva6_cfg_empty,
    parameter type exception_t        = logic,
    parameter type scoreboard_entry_t = logic
) (
    input  logic   clk_i,
    input  logic   rst_ni,
    input  logic   halt_i,          // Don't commit (WFI / debug)
    input  logic   flush_dcache_i,  // Cache flush in progress — hold stores

    // === From Issue/Scoreboard: instructions ready to commit ===
    input  scoreboard_entry_t [CVA6Cfg.NrCommitPorts-1:0] commit_instr_i,
    input  logic              [CVA6Cfg.NrCommitPorts-1:0] commit_drop_i,   // squashed
    output logic              [CVA6Cfg.NrCommitPorts-1:0] commit_ack_o,    // consumed

    // === Register File Writes (architectural state update) ===
    output logic [CVA6Cfg.NrCommitPorts-1:0][4:0]        waddr_o,
    output logic [CVA6Cfg.NrCommitPorts-1:0][XLEN-1:0]   wdata_o,
    output logic [CVA6Cfg.NrCommitPorts-1:0]              we_gpr_o,   // int write enable
    output logic [CVA6Cfg.NrCommitPorts-1:0]              we_fpr_o,   // float write enable

    // === Exception Output → Controller ===
    output exception_t  exception_o,      // cause + tval for exception handling

    // === CSR / Privilege ===
    output logic        dirty_fp_state_o, // FP registers modified
    output logic        single_step_o,    // Debug: single-step exception
    input  logic        single_step_i,    // Debug: single-step requested

    // === Store Commit → LSU ===
    output logic        commit_lsu_o,     // Drain head store buffer entry
    input  logic        commit_lsu_ready_i,// LSU ready to accept store drain

    // === Commit Acknowledgement for CSR port ===
    output logic [CVA6Cfg.NrCommitPorts-1:0] commit_macro_ack_o
);`
      }
    ],
    designDecisions: [
      "commit_drop_i allows the scoreboard to mark an entry as 'committed but squashed' — this happens for instructions on a mispredicted path that already completed execution. They must be removed from the scoreboard without writing to registers.",
      "The LSU store buffer drain is rate-limited by commit_lsu_ready_i. If the D-cache is busy (cache miss on a previous store), the store buffer drain stalls, which can back up to stalling commit. This is a performance bottleneck in write-heavy workloads.",
      "flush_dcache_i temporarily blocks store commits. During a fence.i (instruction cache flush), the pipeline must ensure all stores are committed to cache before the I-cache is invalidated — otherwise a JIT-compiled instruction might not be visible to fetch.",
      "exception_o carries the full exception struct: valid, cause (encoded per RISC-V spec), and tval (the faulting address for load/store faults, or the instruction word for illegal instruction faults). The controller uses this to populate mepc, mcause, and mtval CSRs.",
      "NrCommitPorts determines the peak commit bandwidth. 2 commits/cycle requires checking that both head scoreboard entries are valid, non-exception, and independent (no structural conflicts in the register file write ports)."
    ],
    relatedQuestions: ["l3-q1", "l3-q3", "l1-q3", "l2-q6"]
  }
];

export const getLessonById = (id: string): Lesson | undefined =>
  lessons.find((l) => l.id === id);

export const getLessonsByStage = (): Lesson[] =>
  [...lessons].sort((a, b) => a.stage - b.stage);

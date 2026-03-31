export interface CodeSnippet {
  label: string;
  language: string;
  code: string;
}

export interface Lesson {
  id: string;
  category: string;
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  duration: string;
  summary: string;
  body: string;
  keyInsights: string[];
  snippets: CodeSnippet[];
  relatedQuestions: string[];
}

export const lessons: Lesson[] = [
  {
    id: "lesson-01",
    category: "Pipeline Fundamentals",
    title: "The Fetch-Decode-Execute Pipeline: Why Pipelining Changed Everything",
    difficulty: "beginner",
    duration: "8 min read",
    summary: "How the 5-stage RISC-V pipeline achieves near 1 IPC — and why that required solving the hazard problem from scratch.",
    body: `Before pipelining, CPUs executed one instruction at a time: fetch it, decode it, execute it, access memory, write back — and only then start the next instruction. A single-cycle CPU running at 1 GHz would complete roughly 200 million instructions per second if each instruction takes 5 cycles. That was unacceptable even in the 1980s.

The insight that changed everything: those five stages don't need to operate on the same instruction simultaneously. While stage 2 is decoding instruction N, stage 1 can already be fetching instruction N+1. This is pipelining — borrowed directly from assembly lines and car washes.

The classic 5-stage RISC-V pipeline:
- IF (Instruction Fetch): Read the instruction at PC from the I-cache
- ID (Instruction Decode): Decode opcode, read source registers from the register file
- EX (Execute): ALU computes result or calculates memory address
- MEM (Memory Access): Load or store data to/from D-cache
- WB (Write Back): Write result to destination register

In steady state, all 5 stages work in parallel on 5 different instructions. Throughput approaches 1 instruction per cycle — a 5x improvement over single-cycle for the same clock frequency. But there's a catch.

The pipeline needs storage between stages — "pipeline registers" or "stage latches." At every clock edge, each stage captures its outputs into a register that the next stage reads. These registers carry not just data but context: the PC (for exceptions and branch recovery), the decoded instruction fields, valid bits (to handle bubbles/stalls), and exception flags that were detected upstream.

The valid bit is critical. When a stall is inserted — say, because of a load-use hazard — the downstream stage receives a bubble: a NOP instruction with valid=0. This propagates through the pipeline and is eventually discarded at WB without modifying any state.

The dirty secret of pipelining: it complicates everything downstream. An instruction in the EX stage was fetched 2 cycles ago. Its source registers were read in the ID stage 1 cycle ago. But another instruction might have written to those registers since then. This is the data hazard problem, and solving it elegantly is what separates good CPU designers from great ones.

The pipeline register between IF and ID is the simplest — it just carries the fetched instruction and the PC. But even here, the valid bit matters: if the branch predictor mispredicted and the fetch was wrong, we need to squash this register (set valid=0) during the pipeline flush.

Real CPUs like CVA6 add more fields: the predicted PC (for branch correction), exception bits set during fetch (page fault, misaligned PC), and privilege level. Every field in a pipeline register has a reason — if you see a field you don't understand, ask what exception or corner case it handles.`,
    keyInsights: [
      "Pipelining improves throughput (instructions/second) but does NOT reduce latency for any single instruction — it actually increases it from ~5ns to ~5 cycles worth of latency.",
      "Pipeline registers are the physical implementation of stage boundaries. Each one adds 1 cycle of latency but enables parallel stage operation.",
      "The valid bit (also called bubble bit) is how NOPs propagate through the pipeline without corrupting state. Mastering bubble injection is essential for hazard handling.",
      "Every field in a pipeline register exists to solve a specific problem: PC for exceptions, predicted_pc for branch recovery, exception bits for precise fault handling.",
      "A 5-stage pipeline has 4 pipeline registers (IF/ID, ID/EX, EX/MEM, MEM/WB). In an OoO processor, the concept expands to tens of stages with queues between them."
    ],
    snippets: [
      {
        label: "IF/ID Pipeline Register — SystemVerilog",
        language: "systemverilog",
        code: `// IF/ID pipeline register
// Captures the output of the Fetch stage for use by Decode
typedef struct packed {
  logic [63:0] pc;           // Program counter of this instruction
  logic [63:0] predicted_pc; // Branch predictor's next-PC guess
  logic [31:0] instruction;  // Raw 32-bit instruction word
  logic        valid;        // 0 = bubble/NOP, 1 = real instruction
  logic        ex_valid;     // An exception occurred during fetch
  logic [63:0] ex_tval;      // Exception value (e.g. faulting address)
} if_id_t;

module if_id_register (
  input  logic   clk_i,
  input  logic   rst_ni,
  input  if_id_t if_id_i,    // From fetch stage
  output if_id_t if_id_o,    // To decode stage
  input  logic   stall_i,    // Stall: hold current value
  input  logic   flush_i     // Flush: insert bubble
);
  always_ff @(posedge clk_i or negedge rst_ni) begin
    if (!rst_ni) begin
      if_id_o <= '0; // valid=0, everything cleared
    end else if (flush_i) begin
      if_id_o       <= '0;
      if_id_o.valid <= 1'b0; // Insert bubble
    end else if (!stall_i) begin
      if_id_o <= if_id_i;    // Normal advance
    end
    // stall_i=1 and flush_i=0: hold current value (do nothing)
  end
endmodule`
      }
    ],
    relatedQuestions: ["l1-q1", "l2-q1"]
  },

  {
    id: "lesson-02",
    category: "Pipeline Fundamentals",
    title: "Register Files: The CPU's Scratchpad",
    difficulty: "beginner",
    duration: "7 min read",
    summary: "Why RISC-V has exactly 32 registers, how a register file is built in RTL, and what happens when superscalar designs need more ports.",
    body: `The register file is the fastest storage in a CPU — sitting between the ALU and the cache hierarchy. In RISC-V, there are 32 general-purpose registers (x0–x31), each 64 bits wide in RV64. x0 is hardwired to zero; writes to it are silently discarded.

Why 32 registers? It's a deliberate ISA tradeoff. More registers means fewer memory spills (a compiler can keep more live values in registers), but each register costs bits in the instruction encoding. RISC-V uses 5-bit register fields, supporting 32 registers while keeping instructions 32 bits wide. ARM64 and x86-64 have a similar count for the same reason. Going to 64 registers would require 6-bit fields and would bloat every instruction or force variable-length encoding.

A single-issue in-order pipeline needs a 2-read-1-write register file: decode reads two source operands (rs1 and rs2) combinationally, and writeback writes the result (rd) synchronously. Reads are combinational (asynchronous) because the decode stage needs the values in the same cycle — adding a clock edge would require an extra pipeline stage. Writes are synchronous (registered on clock edge) to ensure clean timing.

For a 2-wide superscalar that can issue two instructions per cycle, you suddenly need 4 read ports (2 instructions × 2 sources) and 2 write ports. Register file area and power scales roughly as O(ports²) — doubling the ports quadruples the cost. This is why real superscalar CPUs use tricks: banking (split register file into multiple arrays with restricted port sharing), or a physical register file shared between multiple functional units.

The zero register optimization: instead of checking "is rs1 == x0?" in the ALU, most designs just allow the normal read path and ensure that register 0 always reads as zero. This is trivially implemented by initializing the register file with 0 at index 0 and preventing writes to it at the register file write port.

Out-of-order processors complicate this dramatically. They use a physical register file (PRF) with 128–256 entries instead of just 32. The Register Alias Table (RAT) maps the 32 architectural registers to physical register numbers. This renaming eliminates false data dependencies (WAW and WAR hazards) and is the key enabler of out-of-order execution. But for a 5-stage in-order pipeline, the simple 32-entry 2R1W file is all you need.

One subtle correctness issue: write-before-read on the same cycle. If an instruction in WB writes to rd=x5 at the same time that a later instruction in ID reads rs1=x5, which value does the ID stage see? This depends on whether the register file implements "write-then-read" (new value) or "read-then-write" (old value) semantics. Most designs implement forwarding from WB to ID to sidestep this — the register file always reads the committed value, and the forwarding network provides the latest in-flight value.`,
    keyInsights: [
      "32 registers is a deliberate ISA tradeoff: enough for compilers to minimize memory spills, few enough to fit in 5-bit instruction fields.",
      "Reads are combinational (async) so decode gets values in the same cycle. Writes are synchronous to provide clean timing for writeback.",
      "Register file port count scales as O(ports²) in area/power — a 4R2W file for 2-wide superscalar is 4× more expensive than a 2R1W file.",
      "x0 always reads as zero. Implement by preventing writes to index 0 at the write port — no special-case logic needed in the ALU.",
      "Out-of-order CPUs use a Physical Register File (PRF) with 128-256 entries, mapped via a Register Alias Table (RAT). This eliminates WAW/WAR false dependencies."
    ],
    snippets: [
      {
        label: "32×64-bit Register File — 2 async read ports, 1 sync write port",
        language: "systemverilog",
        code: `module register_file #(
  parameter int unsigned NR_REGS  = 32,
  parameter int unsigned DATA_W   = 64
)(
  input  logic                      clk_i,
  // Read port A
  input  logic [$clog2(NR_REGS)-1:0] raddr_a_i,
  output logic [DATA_W-1:0]          rdata_a_o,
  // Read port B
  input  logic [$clog2(NR_REGS)-1:0] raddr_b_i,
  output logic [DATA_W-1:0]          rdata_b_o,
  // Write port
  input  logic                       we_i,
  input  logic [$clog2(NR_REGS)-1:0] waddr_i,
  input  logic [DATA_W-1:0]          wdata_i
);
  logic [DATA_W-1:0] mem [NR_REGS];

  // Async reads — combinational, available same cycle as address
  assign rdata_a_o = (raddr_a_i == '0) ? '0 : mem[raddr_a_i];
  assign rdata_b_o = (raddr_b_i == '0) ? '0 : mem[raddr_b_i];

  // Sync write — register file updates on clock edge
  always_ff @(posedge clk_i) begin
    if (we_i && waddr_i != '0) begin // x0 is always zero, discard writes
      mem[waddr_i] <= wdata_i;
    end
  end

  // Initialize all registers to 0 (synthesis: use initial block or reset)
  initial begin
    for (int i = 0; i < NR_REGS; i++) mem[i] = '0;
  end
endmodule`
      }
    ],
    relatedQuestions: ["l1-q1", "l1-q2"]
  },

  {
    id: "lesson-03",
    category: "Pipeline Fundamentals",
    title: "Hazard Detection and Forwarding Networks",
    difficulty: "intermediate",
    duration: "10 min read",
    summary: "The forwarding network is where most students fail RTL interviews. Master every path — EX→EX, MEM→EX, and the load-use stall that no amount of forwarding can fix.",
    body: `Data hazards are the biggest source of pipeline complexity. They occur when an instruction needs a result that hasn't been written back yet. In a 5-stage pipeline, an instruction in EX needs its operands, but the previous instruction's result won't be in the register file until WB — 2 cycles later. Without any mitigation, you'd need 2 stall cycles after every instruction that produces a result. That destroys all pipeline benefit.

Forwarding (also called bypassing) solves this by routing results directly from where they're computed to where they're needed, without waiting for the register file write. There are three forwarding paths you must know cold:

**EX/MEM → EX forward**: The most common case. Instruction N's ALU result is available at the end of the EX stage. Instruction N+1 in EX needs it as an input. Forward the EX/MEM pipeline register value directly to the ALU input mux. This covers the RAW hazard with 1-cycle separation.

**MEM/WB → EX forward**: Instruction N's result passed through MEM and is in the MEM/WB register. Instruction N+2 in EX needs it. Forward MEM/WB register value to ALU input. This covers 2-cycle separation.

**MEM/WB → MEM forward**: For store instructions in MEM that depend on a load result in WB. Less common but must be handled.

The forwarding mux at each ALU input has 3 inputs: the register file output, the EX/MEM forwarded value, and the MEM/WB forwarded value. The hazard detection unit selects which to use by comparing the source register addresses (rs1, rs2) of the instruction in EX against the destination register addresses (rd) of instructions in EX/MEM and MEM/WB.

**The load-use hazard — forwarding cannot save you.** When a load instruction is in EX, its result doesn't exist yet — it won't come back from the D-cache until the end of the MEM stage. So the next instruction in EX (which needs the load result) is one cycle too early. There is no place to forward from. The only solution is to stall the pipeline for 1 cycle: freeze the IF and ID stages (hold their pipeline registers), inject a bubble into EX, and let the load proceed to MEM. After the stall, the load result is in MEM/WB and can be forwarded normally.

The hazard detection unit sits between ID/EX and the IF/ID and ID/EX pipeline registers. It checks: if the instruction in EX is a load AND its rd matches rs1 or rs2 of the instruction in ID — stall. This is the only true stall in a clean 5-stage RISC-V pipeline (assuming a 1-cycle cache).

The forwarding logic must also handle two edge cases: forwarding to x0 should be suppressed (x0 is always zero), and double forwarding — when both EX/MEM and MEM/WB match the same source register, EX/MEM takes priority (it's the newest value).`,
    keyInsights: [
      "EX/MEM→EX forwarding handles 1-cycle separation (most instructions). MEM/WB→EX handles 2-cycle separation. Both are implemented as muxes at ALU inputs.",
      "The load-use hazard cannot be forwarded because the load result doesn't exist until end of MEM stage. A 1-cycle stall (bubble injection) is mandatory.",
      "Stall implementation: assert stall to IF and ID stage registers (hold them), inject NOP into EX stage (clear EX/MEM register).",
      "Forwarding priority: EX/MEM result is newer than MEM/WB. If both match, forward EX/MEM. Never forward to x0.",
      "A compiler can schedule 1 independent instruction in the load delay slot to hide the stall, achieving zero CPI penalty. This is called 'load scheduling'."
    ],
    snippets: [
      {
        label: "Forwarding Mux Select Logic — all paths",
        language: "systemverilog",
        code: `// Forwarding unit: determines ALU input sources
// Inputs from pipeline registers
// ex_mem_rd: destination reg of instruction in EX/MEM stage
// mem_wb_rd: destination reg of instruction in MEM/WB stage
// id_ex_rs1, id_ex_rs2: source regs of instruction currently in EX

typedef enum logic [1:0] {
  FWD_REGFILE = 2'b00, // Use register file output (no hazard)
  FWD_EX_MEM  = 2'b01, // Forward from EX/MEM pipeline register
  FWD_MEM_WB  = 2'b10  // Forward from MEM/WB pipeline register
} fwd_sel_t;

module forwarding_unit (
  input  logic [4:0] id_ex_rs1, id_ex_rs2, // Source regs in EX stage
  input  logic [4:0] ex_mem_rd,             // Dest reg in EX/MEM
  input  logic       ex_mem_we,             // EX/MEM writes a reg
  input  logic [4:0] mem_wb_rd,             // Dest reg in MEM/WB
  input  logic       mem_wb_we,             // MEM/WB writes a reg
  output fwd_sel_t   fwd_a_sel,             // Mux select for ALU input A
  output fwd_sel_t   fwd_b_sel              // Mux select for ALU input B
);
  always_comb begin
    fwd_a_sel = FWD_REGFILE;
    // EX/MEM forward (higher priority — newer value)
    if (ex_mem_we && ex_mem_rd != 5'b0 && ex_mem_rd == id_ex_rs1)
      fwd_a_sel = FWD_EX_MEM;
    // MEM/WB forward (lower priority — older value)
    else if (mem_wb_we && mem_wb_rd != 5'b0 && mem_wb_rd == id_ex_rs1)
      fwd_a_sel = FWD_MEM_WB;
  end
  always_comb begin
    fwd_b_sel = FWD_REGFILE;
    if (ex_mem_we && ex_mem_rd != 5'b0 && ex_mem_rd == id_ex_rs2)
      fwd_b_sel = FWD_EX_MEM;
    else if (mem_wb_we && mem_wb_rd != 5'b0 && mem_wb_rd == id_ex_rs2)
      fwd_b_sel = FWD_MEM_WB;
  end
endmodule`
      }
    ],
    relatedQuestions: ["l2-q1", "l1-q4", "l1-q7"]
  },

  {
    id: "lesson-04",
    category: "Frontend",
    title: "Branch Prediction: Guessing at the Speed of Light",
    difficulty: "intermediate",
    duration: "9 min read",
    summary: "A mispredicted branch wastes 15 cycles in a modern CPU. Here's how branch predictors evolved from 2-bit counters to TAGE — and what the RTL actually looks like.",
    body: `Every time a branch instruction is fetched, the CPU faces a choice: wait to know the outcome (stalling 3–5 cycles in a simple pipeline, 15–20 cycles in a deep out-of-order machine), or guess and keep fetching speculatively. Modern CPUs guess — and they're right over 95% of the time on real workloads.

The cost of a wrong guess (misprediction) is a pipeline flush: squash all instructions fetched after the branch, redirect the PC to the correct target, and restart. In a 20-stage pipeline running at 4 GHz, a single misprediction wastes ~5 nanoseconds. At 1 billion branches per second in typical code, even 5% misprediction rate causes catastrophic throughput loss.

**Bimodal predictor** (also called 2-bit counter table): The simplest practical predictor. Index a table of 2-bit saturating counters using the lower bits of the branch PC. Each counter encodes: strongly-not-taken (00), weakly-not-taken (01), weakly-taken (10), strongly-taken (11). Predict taken if counter ≥ 2. Update: increment on taken, decrement on not-taken, saturate at extremes. A 256-entry bimodal predictor fits in 64 bytes and achieves ~85% accuracy. The weakness: aliasing — two different branches hash to the same entry and interfere.

**Gshare** improves this by XORing the PC with a global branch history register (GHR) before indexing. The GHR is a shift register that records the last N branch outcomes (1=taken, 0=not-taken). The key insight: branch outcomes are correlated — a loop-exit branch is more predictable if you know the loop body branch has been taken 7 times. Gshare achieves ~90–92% accuracy on SPEC benchmarks with a 1K-entry table.

**TAGE** (Tagged Geometric history length predictor) is the state of the art. It maintains multiple tables indexed by XOR of PC with history of geometrically increasing lengths (e.g., 4, 8, 16, 32, 64 bits). Each entry has a tag (partial PC hash) to detect aliasing. The predictor uses the longest matching table as the primary prediction. TAGE with 16K entries achieves >97% accuracy. It's used in BOOM (Berkeley Out-of-Order Machine) and most high-performance ARM cores.

The Branch Target Buffer (BTB) is separate from the direction predictor. While the direction predictor answers "taken or not taken?", the BTB answers "if taken, what is the target PC?" It's indexed by the branch PC and stores the last-seen target address. Unconditional jumps (JAL) always hit the BTB. Indirect jumps (JALR) use a Return Address Stack (RAS) for calls/returns — a small hardware stack of predicted return addresses.

In RTL, the BHT update logic must handle two cases: a prediction was made and the branch resolved (update the counter), or a new branch was seen and no prediction existed (allocate an entry). The update path is always 1+ cycles behind the prediction path, which is fine — speculative execution means you're already several instructions ahead.`,
    keyInsights: [
      "A 15–20 cycle misprediction penalty in OoO CPUs means even 5% misprediction rate destroys performance. Prediction accuracy is mission-critical.",
      "2-bit saturating counters provide hysteresis — a single unusual outcome doesn't flip the prediction, reducing noise from loop edge cases.",
      "Gshare's global history register captures cross-branch correlation. XOR with PC adds PC-specific indexing to reduce aliasing.",
      "TAGE uses geometrically increasing history lengths to capture both short and long-range patterns — different branches need different history depths.",
      "The BTB answers 'where to fetch next' while the direction predictor answers 'is this branch taken'. Both are needed for full branch prediction."
    ],
    snippets: [
      {
        label: "Branch History Table (BHT) — 256-entry bimodal predictor",
        language: "systemverilog",
        code: `// Branch History Table: 256-entry, 2-bit saturating counters
// Used to predict taken/not-taken for conditional branches

module bht #(
  parameter int unsigned NR_ENTRIES = 256  // must be power of 2
)(
  input  logic        clk_i, rst_ni,
  // Prediction interface
  input  logic [63:0] vpc_i,           // Virtual PC of branch being fetched
  output logic        taken_o,         // Predicted outcome
  // Update interface (from execute stage after branch resolves)
  input  logic        update_valid_i,
  input  logic [63:0] update_pc_i,     // PC of resolved branch
  input  logic        update_taken_i   // Actual outcome
);
  localparam int IDX_BITS = $clog2(NR_ENTRIES);
  // 2-bit saturating counter per entry
  logic [1:0] bht_mem [NR_ENTRIES];

  // Predict: index by PC[IDX_BITS+1:2] (skip byte-offset bits)
  logic [IDX_BITS-1:0] pred_idx;
  assign pred_idx = vpc_i[IDX_BITS+1:2];
  assign taken_o  = bht_mem[pred_idx][1]; // MSB: 1x = predict taken

  // Update: saturating increment/decrement
  logic [IDX_BITS-1:0] upd_idx;
  assign upd_idx = update_pc_i[IDX_BITS+1:2];

  always_ff @(posedge clk_i or negedge rst_ni) begin
    if (!rst_ni) begin
      for (int i = 0; i < NR_ENTRIES; i++)
        bht_mem[i] <= 2'b01; // Initialize weakly-not-taken
    end else if (update_valid_i) begin
      if (update_taken_i)
        bht_mem[upd_idx] <= (bht_mem[upd_idx] == 2'b11) ? 2'b11 : bht_mem[upd_idx] + 1;
      else
        bht_mem[upd_idx] <= (bht_mem[upd_idx] == 2'b00) ? 2'b00 : bht_mem[upd_idx] - 1;
    end
  end
endmodule`
      }
    ],
    relatedQuestions: ["l3-q2", "l2-q1"]
  },

  {
    id: "lesson-05",
    category: "Memory Subsystem",
    title: "The Load-Store Unit: Where Memory Meets the Pipeline",
    difficulty: "intermediate",
    duration: "9 min read",
    summary: "Loads and stores are deceptively complex. The store buffer, load forwarding, and memory ordering rules are where subtle bugs live — and where interview questions get hard.",
    body: `Memory operations look simple: load reads from an address, store writes to an address. But in a pipelined processor, they are the source of more corner cases than any other instruction class. Let's walk through what actually happens.

**Address Generation Unit (AGU):** Loads and stores compute their effective address in the EX stage: base_register + sign_extended_immediate. This is just an adder — fast, straightforward. The result feeds the MEM stage, where the D-cache is accessed.

**Why stores can't commit immediately:** When a store executes and its address and data are known, you might think it should write to the cache right away. It can't. The store might be on a speculative path — a branch earlier in the program might not have been taken, making this store's execution incorrect. The store must wait until it reaches the head of the Reorder Buffer (ROB) and commits before it can write to the cache. Until then, it lives in the store buffer.

**The Store Buffer:** A queue of (address, data, size) tuples for stores that have executed but not yet committed. On commit, the store buffer entry is retired to the cache. The store buffer typically holds 16–32 entries in modern designs.

**Load forwarding from the store buffer:** Here's the tricky part. What if a load comes after a store to the same address, but the store hasn't been committed yet? The load can't read the cache — it would get stale data. Instead, the load must check the store buffer: if any entry has a matching address, forward the data directly. This is called store-to-load forwarding and is critical for correctness in code like:

    sw x1, 0(x2)   // store to address A
    lw x3, 0(x2)   // load from address A — must see the store's value

The forwarding logic checks all store buffer entries for address matches. Partial matches (a 4-byte store followed by a 1-byte load at the same address) require extracting the correct byte — this is more complex than a full match.

**Memory ordering:** Modern CPUs under TSO (Total Store Order, used by x86) allow a processor to see its own stores immediately (via the store buffer forward) but other processors see them only after they retire to cache. RISC-V uses RVWMO (Weak Memory Order), which is even more relaxed — loads and stores can be reordered in complex ways. FENCE instructions provide explicit ordering when needed. This matters enormously for concurrent code and lock-free data structures.

**Load-store disambiguation:** In an out-of-order CPU, a load might execute before an older store if the store's address isn't known yet. If the addresses later turn out to alias, the load got the wrong data and must be re-executed. This is called a memory order violation and requires a pipeline squash and replay of the load and everything after it.`,
    keyInsights: [
      "Stores cannot write to cache until they commit (retire from ROB). Before that, they live in the store buffer to support speculative execution rollback.",
      "Store-to-load forwarding: loads must check the store buffer for matching addresses before going to cache. Partial address matches (byte/halfword) require byte extraction logic.",
      "TSO (x86) lets a thread see its own stores immediately via the store buffer, but other threads don't see them until retirement. This is why memory barriers exist.",
      "RISC-V RVWMO is weaker than TSO — more reorderings are permitted, requiring explicit FENCE instructions for synchronization in concurrent code.",
      "Memory order violations in OoO CPUs: when a speculative load gets wrong data due to an earlier store's address resolving late. Requires pipeline squash and replay."
    ],
    snippets: [
      {
        label: "4-entry Store Buffer with Load Forwarding",
        language: "systemverilog",
        code: `// Simplified store buffer with load forwarding
// Stores wait here after execute until commit

typedef struct packed {
  logic [63:0] addr;
  logic [63:0] data;
  logic [2:0]  size;   // 0=byte, 1=half, 2=word, 3=double
  logic        valid;
  logic        committed; // Set when ROB commits, cleared after cache write
} sb_entry_t;

module store_buffer #(parameter int DEPTH = 4) (
  input  logic        clk_i, rst_ni,
  // Store allocation (from execute stage)
  input  logic        store_valid_i,
  input  logic [63:0] store_addr_i,
  input  logic [63:0] store_data_i,
  input  logic [2:0]  store_size_i,
  // Load forwarding check
  input  logic        load_valid_i,
  input  logic [63:0] load_addr_i,
  output logic        fwd_valid_o,   // Forwarding hit
  output logic [63:0] fwd_data_o,   // Forwarded data
  // Commit from ROB
  input  logic        commit_i,
  output logic        full_o
);
  sb_entry_t buf [DEPTH];
  logic [$clog2(DEPTH):0] wr_ptr, rd_ptr;

  assign full_o = (wr_ptr - rd_ptr) == DEPTH;

  // Store allocation
  always_ff @(posedge clk_i or negedge rst_ni) begin
    if (!rst_ni) begin
      wr_ptr <= '0; rd_ptr <= '0;
      for (int i = 0; i < DEPTH; i++) buf[i].valid <= 1'b0;
    end else begin
      if (store_valid_i && !full_o) begin
        buf[wr_ptr[$clog2(DEPTH)-1:0]] <= '{store_addr_i, store_data_i,
                                             store_size_i, 1'b1, 1'b0};
        wr_ptr <= wr_ptr + 1;
      end
      // On commit, mark entry as committed; a separate agent drains to cache
      if (commit_i && buf[rd_ptr[$clog2(DEPTH)-1:0]].valid) begin
        buf[rd_ptr[$clog2(DEPTH)-1:0]].committed <= 1'b1;
        rd_ptr <= rd_ptr + 1;
      end
    end
  end

  // Load forwarding: combinational search for youngest matching store
  always_comb begin
    fwd_valid_o = 1'b0; fwd_data_o = '0;
    for (int i = 0; i < DEPTH; i++) begin
      if (buf[i].valid && load_valid_i &&
          buf[i].addr == load_addr_i) begin // Full-word match simplified
        fwd_valid_o = 1'b1;
        fwd_data_o  = buf[i].data;
      end
    end
  end
endmodule`
      }
    ],
    relatedQuestions: ["l3-q3", "l2-q3"]
  },

  {
    id: "lesson-06",
    category: "Memory Subsystem",
    title: "Cache Architecture: The Memory Hierarchy in Silicon",
    difficulty: "intermediate",
    duration: "10 min read",
    summary: "The gap between CPU speed and DRAM latency is 200×. Caches bridge that gap — here's how tag arrays, set-associativity, and replacement policy work at the RTL level.",
    body: `The single most important performance ratio in computer architecture: a modern CPU executes instructions in ~0.3 nanoseconds (3+ GHz), but a DRAM access takes 60–100 nanoseconds. That's a 200× gap. Without caches, every memory instruction would stall the pipeline for 200 cycles. Nothing else you do in the CPU would matter.

Caches work by exploiting two locality properties:
- **Temporal locality**: recently accessed data will likely be accessed again soon
- **Spatial locality**: if you access address A, you'll likely access A+4, A+8 soon

**Cache Anatomy:** A cache is organized as S sets, each with W ways (W-way set-associative). Each way holds one cache line (typically 64 bytes). For each line, there's a tag (high-order bits of the address), valid bit, dirty bit (for write-back), and the data array.

**Address Decomposition:** Given a 64-bit address accessing a 32KB, 4-way, 64B-line cache:
- Offset bits [5:0]: selects byte within a 64-byte cache line (6 bits)
- Index bits [11:6]: selects which of the 128 sets (7 bits, since 32KB/4-way/64B = 128 sets)
- Tag bits [63:12]: stored in the tag array to verify a hit

**Cache Lookup:** On every load/store, the pipeline: (1) extracts index bits and looks up all 4 tag-array entries in parallel, (2) compares each stored tag against the address tag bits, (3) if any match and valid bit is set → hit, read/write data from that way. If no match → miss, fetch line from L2.

**Replacement Policy:** On a miss, if all ways in the target set are valid, one must be evicted. LRU (Least Recently Used) is optimal but expensive to implement exactly for 4+ ways — you'd need to maintain a total order. PLRU (Pseudo-LRU) uses a binary tree of bits (3 bits for 4-way) to approximate LRU at much lower cost.

**Write Policies:**
- Write-through: every store immediately writes to both cache and next-level memory. Simple, but burns memory bandwidth.
- Write-back: stores update the cache only; the line is written to memory only when evicted (if dirty bit is set). More efficient, requires dirty bit tracking and writeback on eviction.

**Real latency numbers** (rough, 3GHz CPU, 28nm):
- L1 hit: 4 cycles (~1.3 ns)
- L2 hit: 12 cycles (~4 ns)  
- L3 hit: 40 cycles (~13 ns)
- DRAM: 200+ cycles (~65+ ns)

This is why L1 cache miss rate is the most important microarchitecture metric. A 1% L1 miss rate on a load-heavy workload can reduce performance by 20-30%.`,
    keyInsights: [
      "The 200× DRAM latency gap is why caches exist. Without them, a 3 GHz CPU would effectively run at 15 MHz.",
      "Address decomposition: [tag | index | offset]. Index selects the set (parallel tag array lookup), tag verifies the hit, offset selects the byte.",
      "Set-associativity reduces conflict misses at the cost of more tag comparators and a replacement policy. 4-way is the sweet spot for most L1 caches.",
      "PLRU uses a 3-bit binary tree to approximate LRU for 4 ways — O(log N) bits instead of O(N log N) for exact LRU.",
      "Write-back is more bandwidth-efficient than write-through but requires dirty bit tracking and cache-line writeback on eviction."
    ],
    snippets: [
      {
        label: "4-way Set-Associative Cache — Tag Lookup and Hit Detection",
        language: "systemverilog",
        code: `// 4-way set-associative cache tag array lookup
// 32KB total, 64B lines → 128 sets, 4 ways
// Address[5:0]=offset, [11:6]=index, [63:12]=tag

localparam int SETS      = 128;
localparam int WAYS      = 4;
localparam int LINE_BITS = 6;   // log2(64 bytes)
localparam int IDX_BITS  = 7;   // log2(128 sets)
localparam int TAG_BITS  = 64 - IDX_BITS - LINE_BITS; // 51 bits

typedef struct packed {
  logic [TAG_BITS-1:0] tag;
  logic                valid;
  logic                dirty;
} tag_entry_t;

module cache_tag_lookup (
  input  logic [63:0]   req_addr,
  input  tag_entry_t    tag_array [SETS][WAYS], // tag RAM read output
  output logic          hit,
  output logic [1:0]    hit_way,   // which way hit (0-3)
  output logic [TAG_BITS-1:0] req_tag,
  output logic [IDX_BITS-1:0] req_idx
);
  assign req_idx = req_addr[LINE_BITS+IDX_BITS-1 : LINE_BITS];
  assign req_tag = req_addr[63 : LINE_BITS+IDX_BITS];

  always_comb begin
    hit     = 1'b0;
    hit_way = 2'b00;
    for (int w = 0; w < WAYS; w++) begin
      if (tag_array[req_idx][w].valid &&
          tag_array[req_idx][w].tag == req_tag) begin
        hit     = 1'b1;
        hit_way = w[1:0];
      end
    end
  end
endmodule`
      }
    ],
    relatedQuestions: ["l2-q3", "l4-q5", "l3-q4"]
  },

  {
    id: "lesson-07",
    category: "Advanced RTL",
    title: "Clock Domain Crossing: The Silent Killer of Silicon",
    difficulty: "intermediate",
    duration: "10 min read",
    summary: "Metastability has killed real silicon. Here's the physics, the 2-FF synchronizer, why it's not enough for multi-bit data, and the Gray-code async FIFO that actually works.",
    body: `CDC bugs are insidious: they may not show up in simulation, they may not appear in lab bring-up, and then they silently corrupt data in production at low probability. When they do manifest, the failure looks random and is nearly impossible to debug. I have seen tapeouts delayed six months because of a single missed CDC crossing. This lesson is not optional.

**What is metastability?** A flip-flop is a bistable circuit — it has two stable states (0 and 1). If you violate its setup or hold time (by sampling data too close to the clock edge), the output enters a metastable state: a voltage between 0 and 1 that is neither. The FF will eventually resolve to 0 or 1, but the resolution time is unbounded in theory (exponentially distributed in practice). If the metastable output is sampled again before it resolves, the receiving circuit sees garbage.

**The 2-FF synchronizer:** The standard solution for single-bit CDC. Two back-to-back flip-flops in the destination clock domain. The first FF might go metastable, but it has a full clock period to resolve before the second FF samples it. The MTBF (mean time between failures) for a well-designed synchronizer is typically billions of years at normal clock frequencies. This is safe enough.

Critical rule: the output of the first synchronizer FF must not fan out to anything except the second synchronizer FF. Any combinational logic on a potentially-metastable signal can propagate glitches throughout the design.

**Why you cannot synchronize multi-bit binary data directly:** Imagine synchronizing a 4-bit binary counter. The counter transitions from 0111 (7) to 1000 (8) — all 4 bits change simultaneously. The destination clock might capture some bits in the new state and some in the old state: 0000, 0001, 0111, 1000, or any combination. You'd read a value of 0 or 15 instead of 7 or 8.

**Gray code solves this:** Gray code guarantees only 1 bit changes between consecutive values. Synchronizing a Gray-coded counter is safe — even if the transition is captured mid-flight, you see either the old or new value (off by one at most), never a garbage intermediate.

**Async FIFO architecture:** Use two independent counters: a write pointer (in the write clock domain) and a read pointer (in the read clock domain). Gray-code both pointers. Synchronize the write pointer to the read domain (for empty detection) and the read pointer to the write domain (for full detection). The extra-bit trick distinguishes full from empty: full when Gray(wr_ptr) synchronized to read domain shows the MSB differs from rd_ptr but all other bits match.

**CDC verification:** Simulation cannot find metastability. You need dedicated CDC analysis tools (Mentor Questa CDC, Cadence JasperGold CDC) that statically analyze the netlist for unsynchronized crossings. These are non-negotiable in any real tapeout flow.`,
    keyInsights: [
      "Metastability is physical — a flip-flop in an intermediate voltage state. Resolution time is exponentially distributed; the 2-FF synchronizer gives a full clock period for resolution.",
      "Never fan out the output of the first synchronizer FF to combinational logic. Metastable signals can propagate glitches and cause multi-bit corruption downstream.",
      "Gray code for multi-bit CDC: guarantees only 1 bit changes per increment, so a mid-transition capture gives old or new value, never an invalid intermediate.",
      "Async FIFO: separate read/write pointers in separate clock domains, Gray-coded before synchronization. The extra MSB bit distinguishes full from empty.",
      "CDC bugs survive simulation and board bring-up, then manifest as rare random failures in production. Only static CDC analysis tools can guarantee correctness."
    ],
    snippets: [
      {
        label: "2-FF Synchronizer + Gray-coded CDC FIFO Pointer Sync",
        language: "systemverilog",
        code: `// 2-FF synchronizer — single bit crossing
// dst_clk domain receives an async signal from src_clk domain
module sync_ff #(parameter int STAGES = 2) (
  input  logic clk_i, rst_ni,
  input  logic din_i,   // Async input from another domain
  output logic dout_o   // Synchronized output, safe to use in clk_i domain
);
  logic [STAGES-1:0] sync_q;
  // Synthesis attribute to keep FFs back-to-back (no logic between them)
  (* ASYNC_REG = "TRUE" *)
  always_ff @(posedge clk_i or negedge rst_ni) begin
    if (!rst_ni) sync_q <= '0;
    else         sync_q <= {sync_q[STAGES-2:0], din_i};
  end
  assign dout_o = sync_q[STAGES-1];
endmodule

// Gray-code pointer synchronization for async FIFO
// Shows write pointer crossing to read clock domain (for empty flag)
module cdc_ptr_sync #(parameter int PTR_W = 4) (
  input  logic             rd_clk_i, rd_rst_ni,
  input  logic [PTR_W-1:0] wr_ptr_gray_i,  // Gray-coded write pointer
  output logic [PTR_W-1:0] wr_ptr_gray_sync_o // Synced to read domain
);
  logic [PTR_W-1:0] sync_q [2];
  (* ASYNC_REG = "TRUE" *)
  always_ff @(posedge rd_clk_i or negedge rd_rst_ni) begin
    if (!rd_rst_ni) begin
      sync_q[0] <= '0; sync_q[1] <= '0;
    end else begin
      sync_q[0] <= wr_ptr_gray_i;   // First sync stage (may be metastable)
      sync_q[1] <= sync_q[0];        // Second sync stage (resolved)
    end
  end
  assign wr_ptr_gray_sync_o = sync_q[1];
endmodule`
      }
    ],
    relatedQuestions: ["l2-q2", "l4-q6", "l4-q7", "l4-q8", "l1-q5"]
  },

  {
    id: "lesson-08",
    category: "Out-of-Order Execution",
    title: "The Reorder Buffer: Out-of-Order Without Losing Your Mind",
    difficulty: "advanced",
    duration: "12 min read",
    summary: "The ROB is the beating heart of every modern OoO processor. It enables precise exceptions, branch recovery, and in-order retirement while letting execution run wild out-of-order.",
    body: `Out-of-order execution is one of the most powerful techniques in CPU microarchitecture — and the Reorder Buffer is what makes it safe. Without the ROB, out-of-order execution would be impossible to implement correctly. Here's why.

**The core problem:** In an in-order pipeline, when an exception occurs (page fault, illegal instruction), we know exactly which instruction caused it — it's the one currently in the EX or MEM stage. All earlier instructions have committed. In an out-of-order machine, multiple instructions execute simultaneously in different order. If an exception occurs, we need to know the precise architectural state at the faulting instruction — which means all earlier instructions must have committed and no later instructions must have modified state. This is called "precise exceptions."

**The ROB as a circular buffer:** The ROB holds all in-flight instructions in program order. Think of it as a queue where:
- The tail (write end) is where new instructions are allocated at dispatch, in program order
- The head (read end) is where instructions retire (commit) in program order
- Instructions execute out-of-order but commit in-order from the head

Each ROB entry holds: the instruction's destination register, the computed result (or a pointer to it in the physical register file), a "done" bit set when execution completes, an exception bit if the instruction caused a fault, and the exception information (TVAL, exception code).

**Commit logic:** Every cycle, check the head of the ROB. If the head entry's done bit is set and there's no exception, commit: write the result to the architectural register file (or free the old physical register), advance the head pointer. If there's an exception: squash all instructions from head to tail (clear done bits, free physical registers), redirect PC to the exception handler, set CSRs (mcause, mepc, mtval), and start fresh from the handler.

**Branch misprediction recovery:** When a branch resolves incorrectly, everything allocated in the ROB after the mispredicted branch must be squashed. The ROB tail pointer snaps back to the branch's ROB entry. Physical registers allocated for squashed instructions return to the free list. This is why ROBs have "checkpoints" of the RAT state at each branch — to restore the rename map instantly without replaying all committed instructions.

**ROB sizing:** Modern high-performance CPUs have 256–512 ROB entries (Intel Skylake: 224, AMD Zen 4: 320). Larger ROBs capture more ILP (instructions can execute further ahead), but each entry costs area and the commit/wakeup logic scales with ROB depth. For a student or research CPU (CVA6, BOOM), 32–64 entries is typical.

The ROB is arguably the most complex single structure in the CPU. If you understand it deeply — the allocation, writeback, commit, and squash paths — you understand out-of-order execution.`,
    keyInsights: [
      "The ROB enables precise exceptions by enforcing in-order commit: no instruction commits until all older instructions have committed cleanly.",
      "Allocate in-order at tail (dispatch), execute out-of-order, commit in-order from head. The circular buffer structure makes this efficient.",
      "Branch misprediction recovery: squash ROB from mispredicted branch to tail, restore RAT checkpoint, return physical registers to free list, redirect PC.",
      "ROB sizing is a key microarchitectural parameter: larger = more ILP potential, but more area and power. Modern CPUs: 256–512 entries.",
      "The 'done' bit in each ROB entry is set by the execution unit that completes the instruction. The commit logic checks the head entry's done bit every cycle."
    ],
    snippets: [
      {
        label: "ROB Entry Structure + Commit Stage Logic",
        language: "systemverilog",
        code: `// Reorder Buffer entry and commit logic
typedef struct packed {
  logic [63:0]  result;     // Computed value (or physical reg tag for PRF)
  logic [4:0]   rd;         // Destination architectural register
  logic [63:0]  pc;         // PC of this instruction (for exceptions)
  logic         done;       // Set by execution unit when complete
  logic         has_except; // Instruction caused an exception
  logic [63:0]  except_val; // Exception value (e.g., faulting address)
  logic [3:0]   except_cause; // Exception code (per RISC-V spec)
  logic         valid;      // ROB entry is occupied
} rob_entry_t;

module rob_commit #(parameter int DEPTH = 32) (
  input  logic        clk_i, rst_ni,
  input  rob_entry_t  rob [DEPTH],
  input  logic [$clog2(DEPTH)-1:0] head_ptr,
  // Commit outputs
  output logic        commit_valid_o,  // Committing this cycle
  output logic [4:0]  commit_rd_o,     // Destination register
  output logic [63:0] commit_data_o,   // Value to write
  output logic        exception_o,     // Exception at head
  output logic [63:0] exception_pc_o,
  output logic [3:0]  exception_cause_o
);
  rob_entry_t head;
  assign head = rob[head_ptr];

  always_comb begin
    commit_valid_o    = 1'b0;
    commit_rd_o       = '0;
    commit_data_o     = '0;
    exception_o       = 1'b0;
    exception_pc_o    = '0;
    exception_cause_o = '0;

    if (head.valid && head.done) begin
      if (head.has_except) begin
        // Raise exception — squash will happen in the control path
        exception_o       = 1'b1;
        exception_pc_o    = head.pc;
        exception_cause_o = head.except_cause;
      end else begin
        // Clean commit: write result to architectural register file
        commit_valid_o = (head.rd != 5'b0); // skip x0 writes
        commit_rd_o    = head.rd;
        commit_data_o  = head.result;
      end
    end
  end
endmodule`
      }
    ],
    relatedQuestions: ["l3-q1", "l3-q2", "l3-q5"]
  },

  {
    id: "lesson-09",
    category: "Out-of-Order Execution",
    title: "Physical Register Files and Register Renaming",
    difficulty: "advanced",
    duration: "11 min read",
    summary: "WAW and WAR hazards are false dependencies that strangle ILP. Register renaming eliminates them completely — here's the RAT, the free list, and what happens on a branch flush.",
    body: `In an in-order pipeline, we saw that RAW (read-after-write) hazards require forwarding or stalls. But out-of-order processors face two more hazard types that are just as crippling: WAW (write-after-write) and WAR (write-after-read). The key insight: these are false dependencies. They exist only because two instructions happen to use the same architectural register name, not because one instruction's value actually depends on the other's.

Consider this code:
    mul x5, x1, x2    // Instruction A: writes x5
    add x6, x3, x4    // Instruction B: reads x3, x4, writes x6
    div x5, x7, x8    // Instruction C: writes x5 (WAW with A)
    sub x9, x5, x10   // Instruction D: reads x5 (should read C's result)

A and C both write x5. In an out-of-order machine, C might finish before A, then A overwrites x5 with the wrong value — and D reads stale data. This is a WAW hazard. Register renaming solves this by giving each instruction its own unique physical register.

**The Physical Register File (PRF):** Instead of 32 architectural registers, the hardware maintains a larger PRF — typically 128–256 entries on modern designs. The extra entries are the "rename pool" that absorbs the false dependencies.

**The Register Alias Table (RAT):** A 32-entry table mapping each architectural register to its current physical register. On every instruction dispatch:
1. Look up rs1 and rs2 in the RAT to find the source physical registers
2. Allocate a new physical register from the free list for the destination rd
3. Record the old physical register mapping (needed for recovery)
4. Update the RAT entry for rd to point to the new physical register

Now A and C each get unique physical registers (say, p45 and p67). D reads from p67 (C's output), completely unaffected by A's write to p45. The WAW hazard is gone.

**WAR hazards** are also eliminated: a read instruction looks up the RAT and records the physical register at that instant. A later write to the same architectural register gets a new physical register — it never touches the physical register that the read is using.

**The Free List:** A FIFO or bit-vector of available physical registers. On dispatch, dequeue one physical register for the new instruction's result. On commit, the old physical register (the one the RAT pointed to before renaming) is returned to the free list — it's now dead and can be recycled.

**Checkpoint-based recovery:** On a branch, the CPU takes a snapshot of the entire RAT (a "checkpoint"). If the branch mispredicts, restore the RAT to the checkpoint and return all physical registers allocated after the checkpoint to the free list. This makes recovery O(1) regardless of how many instructions were in-flight.

The number of physical registers directly limits the instruction window: you can have at most (PRF_size - 32) instructions in-flight simultaneously. This is why larger PRFs enable higher IPC — they support a bigger window for the CPU to find independent instructions.`,
    keyInsights: [
      "WAW and WAR hazards are false dependencies — register renaming eliminates them by giving each instruction's result its own physical register.",
      "The RAT maps 32 architectural registers to current physical registers. Updated at dispatch, read at dispatch, restored on misprediction.",
      "The free list tracks available physical registers. Allocate at dispatch, free at commit (when the old mapping is no longer needed by in-flight instructions).",
      "Checkpoint recovery: snapshot RAT at each branch. On mispredict, restore RAT checkpoint and bulk-free post-branch physical registers. O(1) recovery.",
      "Maximum in-flight instructions = PRF size - 32 (always need to reserve 32 for committed architectural state). Bigger PRF = more ILP visibility."
    ],
    snippets: [
      {
        label: "RAT Lookup and Free List Allocation",
        language: "systemverilog",
        code: `// Register Alias Table + Free List management
// Simplified: 32 arch regs → 64 physical regs (32 rename slots)

module rat_free_list #(
  parameter int ARCH_REGS = 32,
  parameter int PHYS_REGS = 64
)(
  input  logic                          clk_i, rst_ni,
  // Dispatch: look up source physical regs, allocate dest physical reg
  input  logic [$clog2(ARCH_REGS)-1:0] rs1_i, rs2_i, rd_i,
  input  logic                          dispatch_valid_i,
  output logic [$clog2(PHYS_REGS)-1:0] prs1_o, prs2_o, // source phys regs
  output logic [$clog2(PHYS_REGS)-1:0] prd_o,           // new dest phys reg
  output logic                          free_list_empty_o,
  // Commit: return old physical reg to free list
  input  logic                          commit_valid_i,
  input  logic [$clog2(PHYS_REGS)-1:0] old_prd_i  // physical reg being freed
);
  // RAT: arch_reg → physical_reg
  logic [$clog2(PHYS_REGS)-1:0] rat [ARCH_REGS];
  // Free list: bit-vector of available physical registers
  logic [PHYS_REGS-1:0] free_list;

  // Combinational RAT lookup for source registers
  assign prs1_o = rat[rs1_i];
  assign prs2_o = rat[rs2_i];
  assign free_list_empty_o = (free_list == '0);

  // Find lowest free physical register (priority encoder)
  logic [$clog2(PHYS_REGS)-1:0] next_free;
  always_comb begin
    next_free = '0;
    for (int i = PHYS_REGS-1; i >= 0; i--)
      if (free_list[i]) next_free = i[$clog2(PHYS_REGS)-1:0];
  end
  assign prd_o = next_free;

  always_ff @(posedge clk_i or negedge rst_ni) begin
    if (!rst_ni) begin
      // Initialize: arch reg i maps to physical reg i, rest are free
      for (int i = 0; i < ARCH_REGS; i++) rat[i] <= i[$clog2(PHYS_REGS)-1:0];
      free_list <= {{(PHYS_REGS-ARCH_REGS){1'b1}}, {ARCH_REGS{1'b0}}};
    end else begin
      if (dispatch_valid_i && rd_i != '0 && !free_list_empty_o) begin
        rat[rd_i]         <= next_free;   // Update RAT
        free_list[next_free] <= 1'b0;     // Allocate physical reg
      end
      if (commit_valid_i)
        free_list[old_prd_i] <= 1'b1;    // Return old physical reg to free list
    end
  end
endmodule`
      }
    ],
    relatedQuestions: ["l3-q1", "l3-q5"]
  },

  {
    id: "lesson-10",
    category: "AI Accelerators",
    title: "Systolic Arrays: Matrix Multiplication at Silicon Speed",
    difficulty: "advanced",
    duration: "11 min read",
    summary: "The Google TPU's systolic array achieves 92 TOPS/W by maximizing arithmetic intensity. Here's the PE structure, dataflow, and why it maps so perfectly to matrix multiply.",
    body: `Neural network inference is dominated by one operation: matrix multiplication. A transformer layer doing a 4096×4096 matrix multiply requires 33 billion multiply-accumulate (MAC) operations. If your hardware does 1 TOPS (10^12 operations/second), that's 33 milliseconds per layer — far too slow for real-time inference. The Google TPU achieves 92 TOPS at high efficiency using a systolic array. Here's why it works so well.

**The Roofline Model:** Every compute system has two limits: compute throughput (FLOPS/sec) and memory bandwidth (bytes/sec). The ratio gives the arithmetic intensity threshold. If your algorithm needs fewer FLOPs per byte than the threshold, you're memory-bandwidth-bound. Matrix multiply has arithmetic intensity proportional to the matrix dimension — for large matrices, it's overwhelmingly compute-bound. The goal of a systolic array is to maximize compute utilization while minimizing the memory bandwidth required to feed it.

**Processing Element (PE) Structure:** Each PE is simple: store one weight value (W), receive an activation (A) from the left, compute A×W and add to an accumulator (partial sum), pass A to the right PE, receive a partial sum from above, add W×A, pass updated partial sum downward. In hardware, this is just one multiplier, one accumulator register, and two pass-through registers. The PE runs at the full system clock.

**Weight-Stationary Dataflow:** In the TPU's dataflow, weights are loaded into the PE array once and stay there (stationary). Activations flow left-to-right through the array. Partial sums accumulate vertically (top-to-bottom). For a 256×256 array:
- 256 activations enter from the left simultaneously (one per row)
- Each activation flows right, multiplying by each weight in its row
- Partial sums accumulate downward through 256 rows
- After 256+256-1 cycles, all 256×256 output elements are complete

The key insight: each activation value is used 256 times (once per column). Each weight is reused for every batch element. The memory bandwidth needed is proportional to the perimeter of the matrix, not its area — arithmetic intensity scales with N for NxN matrices.

**Why NVIDIA GPUs are similar:** Tensor cores in NVIDIA Ampere and Hopper are essentially small systolic arrays (4×4 or 8×8 tiles) replicated hundreds of times and orchestrated by a programmable CUDA scheduler. The key difference: the TPU is a pure systolic array (fixed dataflow, very efficient, less flexible), while GPU tensor cores sit inside a general-purpose SIMT architecture (more programmable, somewhat less efficient per watt for pure matrix multiply).

**Sparsity:** A major focus of modern accelerator research. Neural networks often have 50-90% zero weights after pruning. A dense systolic array wastes compute on multiplications by zero. Sparse accelerators (like Nvidia A100's sparsity support, or Cerebras's approach) skip zero-valued MAC operations. This is where the next generation of efficiency gains will come from.

For RTL implementation, the systolic array is beautifully regular — identical PE tiles connected in a grid, all running in lock-step. A 4×4 array fits in ~50 lines of generate-instantiated SystemVerilog. The challenge is in the memory system: feeding 256 activations per cycle to a 256×256 array requires a very wide, very fast buffer.`,
    keyInsights: [
      "Systolic arrays maximize arithmetic intensity by reusing each data element many times: each activation flows through an entire row of PEs, multiplied by 256 weights.",
      "The PE is minimal: one multiplier + one accumulator + two pass-through registers. The power of the systolic array comes from replication, not PE complexity.",
      "Weight-stationary dataflow: load weights once, stream activations through. Memory bandwidth scales as O(N²) while compute scales as O(N³) — compute-bound for large N.",
      "TPU vs GPU: TPU is a purpose-built systolic array (high efficiency, fixed dataflow). GPU tensor cores are small systolic tiles inside general-purpose SIMT (more flexible, slightly less efficient).",
      "The roofline model explains why systolic arrays win for large matrix multiply: the algorithm's arithmetic intensity far exceeds the hardware's compute/bandwidth ratio."
    ],
    snippets: [
      {
        label: "MAC Processing Element + 4×4 Systolic Array via Generate",
        language: "systemverilog",
        code: `// Single MAC Processing Element for systolic array
// Weight-stationary: weight loaded once, activation passes through
module mac_pe #(parameter int DATA_W = 8, parameter int ACC_W = 32) (
  input  logic                clk_i, rst_ni,
  input  logic [DATA_W-1:0]   act_in,    // Activation from left PE
  input  logic [DATA_W-1:0]   weight,    // Stationary weight
  input  logic [ACC_W-1:0]    psum_in,   // Partial sum from above PE
  output logic [DATA_W-1:0]   act_out,   // Pass activation to right PE
  output logic [ACC_W-1:0]    psum_out   // Pass updated partial sum down
);
  logic [ACC_W-1:0] acc;
  // Multiply-accumulate: add weight×activation to incoming partial sum
  always_ff @(posedge clk_i or negedge rst_ni) begin
    if (!rst_ni) begin
      acc      <= '0;
      act_out  <= '0;
    end else begin
      acc      <= psum_in + ({{(ACC_W-DATA_W){1'b0}}, act_in} *
                              {{(ACC_W-DATA_W){1'b0}}, weight});
      act_out  <= act_in; // Pass activation to the right
    end
  end
  assign psum_out = acc;
endmodule

// 4×4 Systolic Array using generate
module systolic_4x4 #(parameter int DATA_W = 8, parameter int ACC_W = 32)(
  input  logic clk_i, rst_ni,
  input  logic [DATA_W-1:0] act_col   [4], // 4 activations enter left column
  input  logic [DATA_W-1:0] weights   [4][4], // Pre-loaded weight matrix
  input  logic [ACC_W-1:0]  psum_top  [4], // Partial sums enter top row (0)
  output logic [ACC_W-1:0]  psum_bot  [4]  // Results exit bottom row
);
  logic [DATA_W-1:0] act_wire [4][5]; // act_wire[row][col]: col 0=input, 4=discard
  logic [ACC_W-1:0]  psum_wire[5][4]; // psum_wire[row][col]: row 0=input, 4=output
  assign psum_wire[0] = psum_top;
  generate
    for (genvar r = 0; r < 4; r++) begin : row
      assign act_wire[r][0] = act_col[r]; // Activations enter from left
      for (genvar c = 0; c < 4; c++) begin : col
        mac_pe #(DATA_W, ACC_W) pe (
          .clk_i, .rst_ni,
          .act_in   (act_wire [r][c]),
          .weight   (weights  [r][c]),
          .psum_in  (psum_wire[r][c]),
          .act_out  (act_wire [r][c+1]),
          .psum_out (psum_wire[r+1][c])
        );
      end
    end
  endgenerate
  assign psum_bot = psum_wire[4];
endmodule`
      }
    ],
    relatedQuestions: ["l3-q8"]
  }
];

export const getLessonById = (id: string): Lesson | undefined =>
  lessons.find((l) => l.id === id);

export const getLessonsByCategory = (): Record<string, Lesson[]> => {
  const map: Record<string, Lesson[]> = {};
  for (const l of lessons) {
    if (!map[l.category]) map[l.category] = [];
    map[l.category].push(l);
  }
  return map;
};

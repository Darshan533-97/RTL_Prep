// Per-file deep analysis of CVA6 RTL
// Each entry covers: internal logic, state machines, always blocks, signal flow

export interface AlwaysBlock {
  label: string;           // block name (always_comb : xxx or always_ff)
  type: "comb" | "seq";
  purpose: string;         // what this block does
  code: string;            // actual code
}

export interface StateMachine {
  name: string;
  states: string[];        // enum state names
  description: string;     // what the FSM controls
  transitions: string;     // key transitions as text
}

export interface FileAnalysis {
  module: string;
  path: string;
  overview: string;         // 2-3 sentence summary
  internalLogic: string;    // detailed explanation of the logic
  alwaysBlocks: AlwaysBlock[];
  stateMachines: StateMachine[];
  keyDesignPoints: string[];
}

export const fileAnalyses: FileAnalysis[] = [

  // ── CONTROLLER ──────────────────────────────────────────────────────────
  {
    module: "controller",
    path: "core/controller.sv",
    overview: "The controller is the CPU's flush arbiter. It collects every event that requires a pipeline flush — branch misprediction, exception, fence, fence.i, sfence.vma, CSR write — and translates each into a specific combination of per-stage flush signals. It is purely combinational except for fence state tracking.",
    internalLogic: `The controller has one large always_comb block (flush_ctrl) that implements a priority-ordered flush policy. Every input event maps to a specific set of flush outputs.

FLUSH PRIORITY (highest first):

1. Branch misprediction (resolved_branch_i.is_mispredict):
   Only flushes un-issued scoreboard entries and the IF stage.
   Does NOT flush the EX/MEM stages — instructions already in execution are valid,
   they just need their results discarded via the scoreboard's cancelled bit.

2. Exception (ex_valid_i) / ERET (eret_i):
   Flushes IF + ID + flushes un-issued scoreboard entries.
   The frontend redirects to the trap vector or epc.

3. FENCE (fence_i):
   Flushes ALL stages (IF, ID, EX, un-issued).
   Optionally flushes D-cache (if DcacheFlushOnFence config is set).
   Uses fence_active state register to track D-cache flush in progress.

4. FENCE.I (fence_i_i):
   Flushes ALL stages + I-cache + asserts halt_frontend_o.
   Uses fence_i_active state register.
   After fence.i completes: clears halt_frontend, allows fetch to resume.
   This is the most complex case — see fence.i handling below.

5. SFENCE.VMA (sfence_vma_i):
   Flushes ALL stages + TLBs.
   Used when the OS changes page table mappings.

6. CSR write with side-effect (flush_csr_i):
   Flushes IF + ID + EX + un-issued.
   Used when writing CSRs that affect CPU behavior (mstatus, etc.).

FENCE.I HANDLING:
fence.i must: (1) drain all stores to cache, (2) flush the I-cache, (3) restart fetch.
The fence_i_active state register tracks this:
  fence_i_i asserted → set fence_i_active_d=1, halt_frontend_o=1
  While fence_i_active_q: keep halt_frontend_o=1
  When caches acknowledge flush → clear fence_i_active_d=0, halt_frontend_o=0

WHY SPLIT FLUSHES?
Not every flush needs to clear the entire pipeline. A branch misprediction only requires canceling instructions younger than the branch — instructions already in the execution units may be useful (e.g., an ALU result from before the branch can still be committed). Flushing everything on every event would be correct but would hurt performance unnecessarily.`,
    alwaysBlocks: [
      {
        label: "always_comb : flush_ctrl",
        type: "comb",
        purpose: "Main flush dispatch logic. Maps every flush event to per-stage flush outputs.",
        code: `always_comb begin : flush_ctrl
  // defaults: nothing active
  fence_active_d         = fence_active_q;
  fence_i_active_d       = fence_i_active_q;
  flush_if_o             = 1'b0;
  flush_unissued_instr_o = 1'b0;
  flush_id_o             = 1'b0;
  flush_ex_o             = 1'b0;
  flush_dcache           = 1'b0;
  flush_icache_o         = 1'b0;
  flush_tlb_o            = 1'b0;
  flush_bp_o             = 1'b0;
  set_pc_commit_o        = 1'b0;

  // ── BRANCH MISPREDICTION (only flush unissued + IF) ──────────────────
  if (resolved_branch_i.is_mispredict) begin
    flush_unissued_instr_o = 1'b1;
    flush_if_o             = 1'b1;
    // NOTE: flush_id_o and flush_ex_o are NOT set here
    // In-flight EX stage instructions are still valid
  end

  // ── FENCE (drain stores, optionally flush D-cache) ────────────────────
  if (fence_i) begin
    set_pc_commit_o        = 1'b1; // restart PC from commit PC
    flush_if_o             = 1'b1;
    flush_unissued_instr_o = 1'b1;
    flush_id_o             = 1'b1;
    flush_ex_o             = 1'b1;
    if (CVA6Cfg.DcacheFlushOnFence) begin
      flush_dcache   = 1'b1;
      fence_active_d = 1'b1; // hold until dcache_ack_i
    end
  end

  // ── FENCE.I (flush I-cache, halt frontend during flush) ───────────────
  if (fence_i_i) begin
    set_pc_commit_o        = 1'b1;
    flush_if_o             = 1'b1;
    flush_unissued_instr_o = 1'b1;
    flush_id_o             = 1'b1;
    flush_ex_o             = 1'b1;
    flush_icache_o         = 1'b1;
    flush_bp_o             = 1'b1; // clear branch predictor too
    fence_i_active_d       = 1'b1;
  end

  // ── SFENCE.VMA (flush TLBs) ──────────────────────────────────────────
  if (sfence_vma_i) begin
    flush_if_o             = 1'b1;
    flush_unissued_instr_o = 1'b1;
    flush_id_o             = 1'b1;
    flush_ex_o             = 1'b1;
    flush_tlb_o            = 1'b1;
    set_pc_commit_o        = 1'b1;
  end

  // ── EXCEPTION / ERET / DEBUG ──────────────────────────────────────────
  if (ex_valid_i || eret_i || set_debug_pc_i) begin
    flush_unissued_instr_o = 1'b1;
    flush_if_o             = 1'b1;
    // EX stage can continue (results will be discarded via scoreboard)
  end

  // ── ACTIVE FENCE: hold until D-cache acknowledges flush ───────────────
  if (fence_active_q) begin
    if (flush_dcache_ack_i) begin
      fence_active_d  = 1'b0;
      set_pc_commit_o = 1'b1;
    end else begin
      flush_dcache = 1'b1; // keep asserting until ack
    end
  end
end`
      },
      {
        label: "always_comb : halt_ctrl",
        type: "comb",
        purpose: "Determines when to assert halt_o to commit_stage and halt_frontend_o to frontend.",
        code: `always_comb begin : halt_ctrl
  halt_o          = 1'b0;
  halt_frontend_o = 1'b0;

  // Halt commit when: WFI (wait for interrupt) or accelerator halt request
  if (halt_csr_i || halt_acc_i)
    halt_o = 1'b1;

  // Halt frontend during fence.i (prevent fetching stale instructions
  // while the I-cache is being flushed and refilled)
  if (fence_i_active_q)
    halt_frontend_o = 1'b1;
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "Branch misprediction only flushes IF + unissued scoreboard entries. In-flight EX/MEM instructions are NOT killed — their results are discarded by the scoreboard's cancelled bit. This avoids wasting already-computed results.",
      "fence_active and fence_i_active are the only state registers in controller.sv. Everything else is purely combinational. This keeps the module simple and fast.",
      "flush_unissued_instr_o is a separate signal from flush_id_o. It tells the scoreboard to kill only entries that haven't been dispatched to a functional unit yet. Already-issued instructions complete normally.",
      "halt_frontend_o is separate from halt_o. During fence.i, the frontend must stop fetching (I-cache is being flushed) but the commit stage must continue draining in-flight instructions until the pipeline is empty."
    ]
  },

  // ── LOAD UNIT ────────────────────────────────────────────────────────────
  {
    module: "load_unit",
    path: "core/load_unit.sv",
    overview: "The load_unit handles all LOAD instructions. It drives a 10-state FSM that sequences: translation request → TLB wait → cache grant → tag send → data return → alignment. Supports multiple outstanding load requests via a load buffer (ldbuf). Key feature: checks store buffer for forwarding before touching the cache.",
    internalLogic: `The load_unit is the most complex individual functional unit in CVA6. It must handle: virtual address translation (TLB), D-cache access protocol, store-to-load forwarding, speculative load handling for non-idempotent regions, data alignment for byte/halfword/word loads, and simultaneous flush/squash during a pending load.

THE LOAD BUFFER (ldbuf):
CVA6 supports NrLoadBufEntries outstanding load requests to the cache. Each ldbuf entry tracks:
  trans_id: which scoreboard entry this load belongs to
  address_offset: the low 3 bits of the address (for byte extraction)
  operation: LB/LH/LW/LD/LBU/LHU/LWU (determines sign extension)

The ldbuf decouples the request interface from the response interface:
  Request side: send address to cache
  Response side: receive data, look up ldbuf to find which trans_id to write back to

DATA ALIGNMENT:
RISC-V loads return data from cache as a 64-bit doubleword. The load_unit must extract the correct bytes:
  LB: extract 1 byte, sign-extend to 64-bit
  LH: extract 2 bytes, sign-extend
  LW: extract 4 bytes, sign-extend
  LD: return full 64-bit
  LBU/LHU/LWU: same as B/H/W but zero-extend (unsigned)

The address_offset stored in ldbuf tells which byte lane to extract from.

STORE-TO-LOAD FORWARDING CHECK:
Before issuing to cache, the load_unit checks:
  page_offset_o (sent to store_unit) = lower 12 bits of virtual address
  page_offset_matches_i (from store_unit) = 1 if any store buffer entry has the same page offset

If matches_i=1 AND store buffer is not empty, the load may alias with a pending store.
The load_unit enters WAIT_WB_EMPTY state and waits for the store buffer to drain before proceeding.
This ensures a load never returns stale data from cache when a newer store to the same address is in the store buffer.`,
    alwaysBlocks: [
      {
        label: "always_comb : load FSM (combinational next-state)",
        type: "comb",
        purpose: "Determines next state and cache request outputs based on current state and inputs.",
        code: `// 10-state load unit FSM — actual states from load_unit.sv
enum logic [3:0] {
  IDLE,               // waiting for a new load request
  WAIT_GNT,           // sent cache request, waiting for grant
  SEND_TAG,           // grant received, send physical address tag
  WAIT_PAGE_OFFSET,   // checking for store buffer aliasing
  ABORT_TRANSACTION,  // load must be aborted (exception / flush)
  ABORT_TRANSACTION_NI, // abort due to non-idempotent region hazard
  WAIT_TRANSLATION,   // TLB miss, waiting for PTW
  WAIT_FLUSH,         // flush_i received mid-transaction
  WAIT_WB_EMPTY,      // store buffer has aliasing entries — wait for drain
  WAIT_SPEC_LOAD      // speculative load to non-idempotent region
} state_d, state_q;

// Key transitions (simplified):
always_comb begin
  state_d      = state_q;
  pop_ld_o     = 1'b0;
  translation_req_o = 1'b0;
  req_port_o.data_req = 1'b0;

  unique case (state_q)
    IDLE: begin
      if (valid_i) begin
        translation_req_o = 1'b1; // request virtual→physical translation
        if (dtlb_hit_i) begin
          // TLB hit: check for store buffer aliasing
          if (page_offset_matches_i && !store_buffer_empty_i)
            state_d = WAIT_WB_EMPTY; // must wait for stores to drain
          else begin
            req_port_o.data_req = 1'b1; // issue cache request
            state_d = WAIT_GNT;
          end
        end else begin
          state_d = WAIT_TRANSLATION; // TLB miss: wait for PTW
        end
        // Exception during translation? Go straight to ABORT
        if (ex_i.valid) state_d = ABORT_TRANSACTION;
      end
    end

    WAIT_GNT: begin
      req_port_o.data_req = 1'b1; // keep requesting
      if (req_port_i.data_gnt) begin
        state_d = SEND_TAG; // cache granted: send physical tag next cycle
      end
    end

    SEND_TAG: begin
      // Physical tag sent to cache. Cache will respond in 1 cycle (hit) or more (miss)
      req_port_o.tag_valid = 1'b1;
      state_d = IDLE; // accept next request (pipelined)
      pop_ld_o = 1'b1; // pop this request from input buffer
    end

    WAIT_WB_EMPTY: begin
      // Waiting for store buffer to drain before we can safely read cache
      if (store_buffer_empty_i) begin
        req_port_o.data_req = 1'b1;
        state_d = WAIT_GNT;
      end
    end

    WAIT_TRANSLATION: begin
      translation_req_o = 1'b1;
      if (dtlb_hit_i) begin // PTW filled the TLB
        req_port_o.data_req = 1'b1;
        state_d = WAIT_GNT;
      end
      if (ex_i.valid) state_d = ABORT_TRANSACTION;
    end

    ABORT_TRANSACTION: begin
      // Exception: write exception to scoreboard writeback, discard load
      pop_ld_o = 1'b1;
      state_d  = IDLE;
    end
  endcase

  // Flush overrides everything: abort all in-flight loads
  if (flush_i) begin
    state_d = (state_q inside {WAIT_GNT, SEND_TAG}) ? WAIT_FLUSH : IDLE;
  end
end`
      },
      {
        label: "always_comb : data alignment and sign extension",
        type: "comb",
        purpose: "Extracts and sign-extends the correct bytes from the 64-bit cache response based on operation type.",
        code: `// Data alignment: extract correct bytes from 64-bit cache line response
// address_offset = ldbuf_rdata.address_offset (low 3 bits of load address)
// operation      = LB/LH/LW/LD/LBU/LHU/LWU

always_comb begin : data_align_output
  result_o = '0;
  unique case (ldbuf_rdata.operation)
    LWU: result_o = {32'b0, req_port_i.data_rdata[8*address_offset +: 32]};
    LHU: result_o = {48'b0, req_port_i.data_rdata[8*address_offset +: 16]};
    LBU: result_o = {56'b0, req_port_i.data_rdata[8*address_offset +:  8]};
    LW:  result_o = {{32{req_port_i.data_rdata[8*address_offset+31]}},
                      req_port_i.data_rdata[8*address_offset +: 32]};  // sign-ext
    LH:  result_o = {{48{req_port_i.data_rdata[8*address_offset+15]}},
                      req_port_i.data_rdata[8*address_offset +: 16]};
    LB:  result_o = {{56{req_port_i.data_rdata[8*address_offset+ 7]}},
                      req_port_i.data_rdata[8*address_offset +:  8]};
    LD:  result_o = req_port_i.data_rdata; // full 64-bit, no extension
    default: result_o = req_port_i.data_rdata;
  endcase
end`
      }
    ],
    stateMachines: [
      {
        name: "Load FSM",
        states: ["IDLE", "WAIT_GNT", "SEND_TAG", "WAIT_PAGE_OFFSET", "ABORT_TRANSACTION", "ABORT_TRANSACTION_NI", "WAIT_TRANSLATION", "WAIT_FLUSH", "WAIT_WB_EMPTY", "WAIT_SPEC_LOAD"],
        description: "Controls the load pipeline: translation request → grant → tag send → response capture → alignment",
        transitions: "IDLE→WAIT_TRANSLATION (TLB miss) | IDLE→WAIT_GNT (TLB hit, no alias) | IDLE→WAIT_WB_EMPTY (store alias) | WAIT_GNT→SEND_TAG (cache grants) | Any→ABORT (exception) | Any→WAIT_FLUSH (flush_i)"
      }
    ],
    keyDesignPoints: [
      "The load buffer (ldbuf) decouples request from response. The FSM issues the cache request and immediately advances to IDLE to accept the next load. When the cache responds (potentially out-of-order with multiple outstanding requests), ldbuf_rindex identifies which scoreboard entry to write back to.",
      "Store-to-load forwarding check via page offset comparison: the load sends its 12-bit page offset to the store unit, which checks all store buffer entries for a match. This is a virtual address check (page offset is not affected by translation), so it can happen before TLB lookup completes.",
      "WAIT_SPEC_LOAD and ABORT_TRANSACTION_NI handle non-idempotent memory regions (MMIO). A speculative load to an MMIO address cannot be retried if it was on a mispredicted path — reading MMIO registers may have side effects. The load unit checks dcache_wbuffer_not_ni_i and waits until no non-idempotent transactions are in the write buffer.",
      "data_rdata from the cache is always 64 bits. The address_offset field in ldbuf (low 3 bits of the load address) tells the alignment logic which byte lane to extract from. For LB at address 0x5, you extract byte [5*8 +: 8] = bits [47:40]."
    ]
  },

  // ── STORE UNIT ───────────────────────────────────────────────────────────
  {
    module: "store_unit",
    path: "core/store_unit.sv",
    overview: "The store_unit has two responsibilities: (1) accept store instructions from the issue stage, translate their addresses, and put them in the store buffer; (2) on commit, drain the oldest store buffer entry to the D-cache. It includes a data_align function for byte/halfword/word writes and handles AMOs through the amo_req/amo_resp interface.",
    internalLogic: `The store_unit operates in two independent paths:

PATH 1 — STORE ALLOCATION (execute side):
When a STORE instruction is dispatched (valid_i=1), the store_unit:
  1. Issues translation_req_o to the MMU with the virtual address
  2. Waits for dtlb_hit_i (TLB hit) or WAIT_TRANSLATION (TLB miss via PTW)
  3. On TLB hit: runs data_align() to position the data bytes correctly for the target address,
     computes byte enables (which bytes of the 64-bit doubleword are written)
  4. Writes {paddr, aligned_data, byte_enables, trans_id} into the store buffer
  5. Asserts valid_o to the scoreboard (store is "done" from the issue stage's perspective — result=0)

PATH 2 — STORE DRAIN (commit side):
When commit_stage asserts commit_i:
  1. The store buffer marks its oldest valid entry as "committed"
  2. The drain logic takes the committed entry and issues it to the D-cache via req_port_o
  3. On D-cache grant (req_port_i.data_gnt=1): the entry is dequeued
  4. commit_ready_o goes high when the drain is accepted

DATA ALIGNMENT (data_align function):
RISC-V stores write to byte-addressed memory. The D-cache works with 64-bit doublewords.
A SB (store byte) to address 0x5 must write one byte to lane [5] of the 64-bit word.
The data_align function rotates the data to place it at the correct byte lane,
and the byte enable (be) mask tells the cache which lanes to update.

Example: SB x1, 0x5(x0) — store byte to address 5
  data_in = 8'hAB (byte to store)
  data_align(addr=0x5, data=64'hAB): returns 64'h0000_AB00_0000_0000 (byte at lane 5)
  be = 8'b0010_0000 (only lane 5 enabled)

AMO HANDLING:
For atomic instructions (LR/SC, AMOSWAP, etc.), the store_unit routes through the amo_req/amo_resp interface. AMOs are handled differently from regular stores — they require an exclusive cache line access (read-modify-write in a single atomic operation). The amo_buffer.sv holds the pending AMO until commit.

PAGE OFFSET ALIASING CHECK:
The store_unit receives page_offset_i from the load_unit (low 12 bits of the load address).
It checks all store buffer entries: if any entry has the same page offset (address[11:0] match),
it asserts page_offset_matches_o=1.
This signals the load_unit to wait for stores to drain before reading from cache.`,
    alwaysBlocks: [
      {
        label: "always_comb : store FSM",
        type: "comb",
        purpose: "Controls store allocation pipeline: translation → store buffer write → ack to scoreboard",
        code: `// 4-state store FSM
enum logic [1:0] { IDLE, VALID_STORE, WAIT_TRANSLATION, WAIT_STORE_READY } state;

always_comb begin : store_fsm
  state_d    = state_q;
  translation_req_o = 1'b0;
  valid_o    = 1'b0;
  pop_st_o   = 1'b0;
  st_valid   = 1'b0;

  unique case (state_q)
    IDLE: begin
      if (valid_i && !instr_is_amo) begin
        translation_req_o = 1'b1; // request address translation
        if (ex_i.valid) begin
          // Exception during translation (e.g., store page fault)
          valid_o  = 1'b1;  // report to scoreboard (with exception)
          pop_st_o = 1'b1;  // remove from input FIFO
        end else if (dtlb_hit_i) begin
          state_d = VALID_STORE; // TLB hit: proceed to buffer write
        end else begin
          state_d = WAIT_TRANSLATION; // TLB miss: wait for PTW
        end
      end
    end

    VALID_STORE: begin
      translation_req_o = 1'b1;
      // Try to write to store buffer
      if (st_ready) begin // store buffer has space
        st_valid = 1'b1;  // write to store buffer
        valid_o  = 1'b1;  // signal scoreboard: store "done" (result=0)
        pop_st_o = 1'b1;  // dequeue from input
        state_d  = IDLE;
      end else begin
        state_d = WAIT_STORE_READY; // buffer full, wait
      end
    end

    WAIT_TRANSLATION: begin
      translation_req_o = 1'b1;
      if (dtlb_hit_i) state_d = VALID_STORE;
      if (ex_i.valid) begin
        valid_o = 1'b1; pop_st_o = 1'b1; state_d = IDLE;
      end
    end

    WAIT_STORE_READY: begin
      translation_req_o = 1'b1;
      if (st_ready) begin
        st_valid = 1'b1; valid_o = 1'b1; pop_st_o = 1'b1; state_d = IDLE;
      end
    end
  endcase

  if (flush_i) begin
    state_d  = IDLE;
    pop_st_o = 1'b1; // discard current instruction on flush
  end
end`
      },
      {
        label: "data_align function — byte lane positioning",
        type: "comb",
        purpose: "Rotates store data to the correct byte lane in the 64-bit cache interface based on address offset.",
        code: `// From store_unit.sv — actual function
// Positions store data for the correct byte lanes in a 64-bit cache word
function automatic [CVA6Cfg.XLEN-1:0] data_align(logic [2:0] addr, logic [63:0] data);
  logic [63:0] data_tmp = 64'b0;
  logic [2:0]  addr_tmp = {(addr[2] && CVA6Cfg.IS_XLEN64), addr[1:0]};
  case (addr_tmp)
    // Rotate data left by addr bytes (big-endian reordering for cache interface)
    3'b000: data_tmp[CVA6Cfg.XLEN-1:0] = data[CVA6Cfg.XLEN-1:0];  // aligned
    3'b001: data_tmp[CVA6Cfg.XLEN-1:0] = {data[XLEN-9:0],  data[XLEN-1:XLEN-8]};   // 1 byte
    3'b010: data_tmp[CVA6Cfg.XLEN-1:0] = {data[XLEN-17:0], data[XLEN-1:XLEN-16]};  // 2 bytes
    3'b011: data_tmp[CVA6Cfg.XLEN-1:0] = {data[XLEN-25:0], data[XLEN-1:XLEN-24]};  // 3 bytes
    // 64-bit only cases:
    3'b100: data_tmp = {data[31:0], data[63:32]};
    3'b101: data_tmp = {data[23:0], data[63:24]};
    3'b110: data_tmp = {data[15:0], data[63:16]};
    3'b111: data_tmp = {data[7:0],  data[63:8]};
  endcase
  return data_tmp[CVA6Cfg.XLEN-1:0];
endfunction`
      }
    ],
    stateMachines: [
      {
        name: "Store FSM",
        states: ["IDLE", "VALID_STORE", "WAIT_TRANSLATION", "WAIT_STORE_READY"],
        description: "Controls the store allocation pipeline from dispatch to store buffer write",
        transitions: "IDLE→WAIT_TRANSLATION (TLB miss) | IDLE→VALID_STORE (TLB hit) | VALID_STORE→IDLE (store buffer write) | VALID_STORE→WAIT_STORE_READY (buffer full) | Any→IDLE (flush)"
      }
    ],
    keyDesignPoints: [
      "Stores write result_o=0 to the scoreboard immediately after the address is translated and the entry enters the store buffer. The scoreboard considers the store 'done' at this point — the actual cache write happens later at commit. This is correct because stores have no destination register.",
      "The store buffer is a FIFO (not CAM). The drain logic always drains the oldest entry (head of FIFO). This maintains store ordering — a later store cannot drain before an earlier one.",
      "page_offset_matches_o is a combinational scan of ALL store buffer entries against page_offset_i. This is an O(N) comparator array where N=store buffer depth. For a 4-entry store buffer, this is 4 comparators running in parallel.",
      "AMO instructions (LR/SC, AMOSWAP, AMOADD, etc.) bypass the store buffer path entirely. They go through amo_req_o/amo_resp_i to the cache, which handles them atomically. The amo_buffer.sv ensures only one AMO is outstanding at a time."
    ]
  },

  // ── PAGE TABLE WALKER ─────────────────────────────────────────────────────
  {
    module: "ptw",
    path: "core/mmu.sv (sub-module)",
    overview: "The Page Table Walker (PTW) implements hardware Sv39 page table traversal. When the ITLB or DTLB misses, the PTW walks the 3-level page table (L2 → L1 → L0) by reading PTEs from DRAM via the D-cache. It handles superpage detection (2MB and 1GB pages), access/dirty bit updates, and page fault generation.",
    internalLogic: `Sv39 virtual address format:
  [63:39] = sign extension (must match bit 38)
  [38:30] = VPN[2] — L2 page table index (9 bits)
  [29:21] = VPN[1] — L1 page table index (9 bits)
  [20:12] = VPN[0] — L0 page table index (9 bits)
  [11:0]  = page offset (4KB granularity)

Each PTE (Page Table Entry) is 64 bits:
  [63:54] = reserved
  [53:10] = PPN (Physical Page Number)
  [9:8]   = RSW (reserved for software)
  [7]     = D (dirty bit)
  [6]     = A (accessed bit)
  [5]     = G (global mapping)
  [4]     = U (user accessible)
  [3]     = X (executable)
  [2]     = W (writable)
  [1]     = R (readable)
  [0]     = V (valid)

THE WALK SEQUENCE (4-state FSM):

IDLE: wait for itlb_access_i or dtlb_access_i
  → WAIT_GRANT: request L2 PTE from D-cache (paddr = satp.ppn * 4096 + VPN[2] * 8)

WAIT_GRANT: wait for D-cache grant
  → PTW_LVL1: on grant, send PTE tag; on data_rvalid, decode PTE

PTW_LVL1 / PTW_LVL2: decode received PTE:
  If PTE.V=0 or (PTE.R=0 and PTE.W=1): PAGE FAULT
  If PTE.R=1 or PTE.X=1: LEAF NODE (found the actual page mapping)
    → extract physical address, check permissions (U/S/R/W/X vs access type)
    → if superpage: PPN[1:0] or PPN[0] come from the VPN (merged)
    → fill TLB entry, assert itlb_update_o or dtlb_update_o
  If PTE.R=0 and PTE.X=0: NON-LEAF (pointer to next level table)
    → compute address of next-level PTE and issue another cache read

PERMISSION CHECKS:
After finding the leaf PTE, the PTW verifies:
  - U-mode access: PTE.U must be set
  - S-mode access: PTE.U must NOT be set (unless mstatus.SUM is set)
  - Load: PTE.R must be set (or PTE.X=1 with mstatus.MXR=1)
  - Store: PTE.W must be set
  - Fetch: PTE.X must be set
  Any violation → page fault with appropriate cause code`,
    alwaysBlocks: [
      {
        label: "always_comb : ptw FSM + PTE decode",
        type: "comb",
        purpose: "Walks the 3-level Sv39 page table and fills TLB entries",
        code: `// PTW state machine — from core/mmu.sv (simplified)
enum logic [1:0] { IDLE, WAIT_GRANT, PTW_LVL1, PTW_LVL2 } ptw_state;

always_comb begin : ptw_fsm
  ptw_state_d         = ptw_state_q;
  ptw_active_o        = 1'b0;
  itlb_update_o.valid = 1'b0;
  dtlb_update_o.valid = 1'b0;
  page_fault_o        = 1'b0;
  dcache_req_o.data_req = 1'b0;

  unique case (ptw_state_q)
    IDLE: begin
      if (itlb_access_i || dtlb_access_i) begin
        // Start walk: read L2 PTE
        // L2 PTE address = satp_ppn * PAGE_SIZE + VPN[2] * PTE_SIZE
        ptw_pptr_n    = {satp_ppn_i, vaddr_i[38:30], 3'b0}; // 9-bit VPN[2], 8-byte PTEs
        ptw_state_d   = WAIT_GRANT;
        ptw_active_o  = 1'b1;
      end
    end

    WAIT_GRANT: begin
      ptw_active_o        = 1'b1;
      dcache_req_o.data_req = 1'b1;  // request PTE from D-cache
      dcache_req_o.vaddr  = ptw_pptr_q; // address of PTE

      if (req_port_i.data_gnt) begin
        ptw_state_d = PTW_LVL1; // cache granted: PTE data comes next cycle
      end
    end

    PTW_LVL1: begin  // L2 PTE received
      ptw_active_o = 1'b1;
      if (req_port_i.data_rvalid) begin
        automatic riscv::pte_sv39_t pte = req_port_i.data_rdata[63:0];

        if (!pte.v || (!pte.r && pte.w))  // invalid PTE
          page_fault_o = 1'b1; // page fault

        else if (pte.r || pte.x) begin    // leaf PTE (superpage: 1GB)
          // Check: VPN[1] and VPN[0] must be 0 for aligned superpage
          if (vaddr_i[29:12] != '0) page_fault_o = 1'b1; // misaligned superpage
          else begin
            // Permission check + TLB fill
            if (check_permissions(pte, is_store, is_fetch, priv_lvl))
              fill_tlb(pte, page_size_1GB);
            else page_fault_o = 1'b1;
          end
          ptw_state_d = IDLE;
        end else begin  // non-leaf: go to next level (L1)
          ptw_pptr_n  = {pte.ppn, vaddr_i[29:21], 3'b0}; // L1 PTE address
          ptw_state_d = WAIT_GRANT; // issue next cache read
        end
      end
    end

    PTW_LVL2: begin  // L1 PTE received (similar to LVL1 but for L0 descent)
      // ... same structure, handles 2MB superpages and 4KB pages
    end
  endcase
end`
      }
    ],
    stateMachines: [
      {
        name: "PTW Walk FSM",
        states: ["IDLE", "WAIT_GRANT", "PTW_LVL1", "PTW_LVL2"],
        description: "Walks the Sv39 3-level page table by issuing successive D-cache reads for each level's PTE",
        transitions: "IDLE→WAIT_GRANT (TLB miss) | WAIT_GRANT→PTW_LVL1 (D-cache grant) | PTW_LVL1→IDLE (leaf PTE or fault) | PTW_LVL1→WAIT_GRANT (non-leaf: read next level)"
      }
    ],
    keyDesignPoints: [
      "The PTW uses the D-cache (not a separate memory interface) to read PTEs. This means PTW walks share D-cache bandwidth with normal loads/stores. A 3-level walk requires 3 D-cache reads: one per table level.",
      "Superpage support (1GB and 2MB pages): if a non-leaf PTE is encountered at level 2 or 1 and PTE.R=1 or PTE.X=1, it is a superpage. The PPN from this PTE plus the remaining VPN bits give the physical address. The TLB stores the page size so it can reconstruct the physical address correctly.",
      "The A (accessed) and D (dirty) bits in PTEs are managed by hardware in some implementations. CVA6 defers this to software: if A=0 for a read, or D=0 for a write, it raises a page fault and lets the OS kernel update the bits. This simplifies hardware at the cost of more page faults.",
      "PTW vs TLB vs cache: The TLB is consulted first (1 cycle if hit). On TLB miss, the PTW walks memory (multiple D-cache reads). The D-cache serves PTW requests like any other load — if the PTE is cached, the walk is fast (3 cycles per level); if the PTE cache-misses, the walk can take 100+ cycles."
    ]
  }
];

export const getAnalysisByModule = (module: string): FileAnalysis | undefined =>
  fileAnalyses.find(a => a.module === module);

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
  },

  // ── REGISTER FILE ────────────────────────────────────────────────────────
  {
    module: "ariane_regfile_ff",
    path: "core/ariane_regfile_ff.sv",
    overview: "The architectural integer register file: 32 registers × DATA_WIDTH bits. Parametric read ports (NR_READ_PORTS, default 2) and NrCommitPorts write ports. Reads are fully combinational (async). Writes are synchronous on the clock edge. x0 is always zero.",
    internalLogic: `This is one of the simplest but most critical modules in the design. Every instruction that produces an integer result eventually writes here at commit time, and every instruction that reads source operands reads from here at issue time.

THE STORAGE:
logic [NUM_WORDS-1:0][DATA_WIDTH-1:0] mem;
A 2D array of flip-flops: 32 rows × 64 bits. NUM_WORDS = 2^5 = 32.
In silicon, this is synthesized as a flip-flop array (not SRAM) — hence "ff" in the name.
The FPGA variant (ariane_regfile_fpga.sv) uses distributed RAM instead.

READ PORTS (combinational):
rdata_o[i] = mem[raddr_i[i]] — direct array read, no pipeline register.
This means the register file output is valid in the SAME cycle the address is presented.
The issue stage reads rs1 and rs2 addresses from the scoreboard and gets the values instantly.

WRITE PORTS (synchronous):
The write uses a decoded write-enable approach: a we_dec[j][i] matrix where
we_dec[j][i] = 1 when write port j is writing to address i (waddr_i[j] == i).
This creates 32 × NrCommitPorts comparators — area is O(N × W) where N=32, W=NrCommitPorts.

THE ZERO REGISTER:
The ZERO_REG_ZERO parameter (default 0) controls how x0 is kept at zero:
  - ZERO_REG_ZERO=0: x0 is in the array but the we_dec decoder ensures no write
    ever hits address 0 when we_i is asserted (commit_stage already filters we_gpr_o for rd!=0)
  - ZERO_REG_ZERO=1: x0 is explicitly zeroed every cycle: mem[0] <= 0 in always_ff

WHY NOT SRAM?
Register files accessed every cycle for multiple reads need very low latency (0 cycles = combinational).
SRAM has 1-cycle read latency which would add a pipeline stage.
For 32 entries × 64 bits = 2048 bits, the area of flip-flops is acceptable.
Larger structures (512+ entries for physical register files in OoO machines) would use SRAM.`,
    alwaysBlocks: [
      {
        label: "always_comb : we_decoder",
        type: "comb",
        purpose: "Decodes the write address into a one-hot write-enable vector for each register.",
        code: `// Write-enable decoder: for each write port j and each register i,
// assert we_dec[j][i] = 1 only when writing to register i
always_comb begin : we_decoder
  for (int unsigned j = 0; j < CVA6Cfg.NrCommitPorts; j++) begin
    for (int unsigned i = 0; i < NUM_WORDS; i++) begin
      if (waddr_i[j] == i) we_dec[j][i] = we_i[j];
      else                  we_dec[j][i] = 1'b0;
    end
  end
end
// Result: we_dec[0] is a one-hot vector with exactly one bit set
// This drives each register's write-enable input independently`
      },
      {
        label: "always_ff : register_write_behavioral",
        type: "seq",
        purpose: "Synchronous write: updates registers on clock edge when write-enable is asserted.",
        code: `// Synchronous write port — actual code from ariane_regfile_ff.sv
always_ff @(posedge clk_i, negedge rst_ni) begin : register_write_behavioral
  if (~rst_ni) begin
    mem <= '{default: '0};  // clear all registers on reset
  end else begin
    for (int unsigned j = 0; j < CVA6Cfg.NrCommitPorts; j++) begin
      for (int unsigned i = 0; i < NUM_WORDS; i++) begin
        if (we_dec[j][i]) begin
          mem[i] <= wdata_i[j];  // write result to register i
        end
      end
      if (ZERO_REG_ZERO) begin
        mem[0] <= '0;  // keep x0 = 0 unconditionally (optional parameter)
      end
    end
  end
end

// Read ports: fully combinational — no clock dependency
for (genvar i = 0; i < NR_READ_PORTS; i++) begin
  assign rdata_o[i] = mem[raddr_i[i]];  // direct array index read
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "Combinational read ports mean register file reads have 0-cycle latency — the issue stage gets operand values in the same cycle it presents the register addresses. This is essential for keeping the decode-to-issue pipeline tight.",
      "The we_dec decoder creates 32 × NrCommitPorts comparators. For NrCommitPorts=2, that's 64 comparators running in parallel. Synthesis typically maps this to a decoder tree, not 64 individual equality checks.",
      "Priority on simultaneous writes to the same register: the inner loop iterates j from 0 to NrCommitPorts-1. If two commit ports write to the same register in the same cycle (which the scoreboard prevents for correctness), port NrCommitPorts-1 wins. In practice, CVA6's commit logic ensures no two instructions write the same register in the same cycle.",
      "ZERO_REG_ZERO=0 relies on the commit stage to never assert we_gpr_o when rd=x0. This is guaranteed by commit_stage.sv (we_gpr_o[0] = commit_instr_i[0].rd != 5'b0). It saves one extra comparator per cycle versus the explicit ZERO_REG_ZERO=1 approach."
    ]
  },

  // ── MULT / MULTIPLIER / SERDIV ─────────────────────────────────────────
  {
    module: "mult",
    path: "core/mult.sv",
    overview: "mult.sv is the arbiter between the multiplier and divider. It dispatches MUL* operations to multiplier.sv (3-cycle pipelined) and DIV*/REM* operations to serdiv.sv (iterative, up to 64 cycles). MUL results take priority over DIV results on the output bus.",
    internalLogic: `mult.sv is surprisingly thin — it's primarily a dispatcher and output mux. The actual computation happens in its two sub-modules.

DISPATCH LOGIC:
mul_valid_op = ~flush_i && mult_valid_i && operation inside {MUL, MULH, MULHU, MULHSU, MULW, CLMUL...}
div_valid_op = ~flush_i && mult_valid_i && operation inside {DIV, DIVU, DIVW, DIVUW, REM, REMU...}

Only one of mul_valid_op or div_valid_op can be true for any given instruction.
flush_i gates both: a pipeline flush cancels any in-flight operation.

OUTPUT ARBITRATION:
Multiplication takes priority: div_ready_i = (mul_valid) ? 0 : 1
If a multiplication result is valid this cycle, the divider is told "not ready to accept output."
This prevents a division result from being presented while a multiplication is completing.
The result mux: result_o = mul_valid ? mul_result : div_result

WORD OPERATIONS (MULW, DIVW, REMW):
For 32-bit word operations on a 64-bit machine:
  - Inputs are sign-extended from 32 bits to 64 bits before the operation
  - Results are sign-extended from 32 bits back to 64 bits
  This is handled in mult.sv before passing operands to multiplier/serdiv.

mult_ready_o:
The multiplier is always ready (combinational dispatch, pipelined internally).
mult_ready_o = div_ready (the bottleneck is always the divider, not the multiplier).
If a DIV instruction is in-flight, mult_ready_o=0 — issue stage must stall.`,
    alwaysBlocks: [
      {
        label: "Dispatch and output mux (combinational assigns in mult.sv)",
        type: "comb",
        purpose: "Routes operations to the correct sub-unit and muxes their results",
        code: `// Operation dispatch — purely combinational
assign mul_valid_op = ~flush_i && mult_valid_i &&
  (fu_data_i.operation inside {MUL, MULH, MULHU, MULHSU, MULW, CLMUL, CLMULH, CLMULR});

assign div_valid_op = ~flush_i && mult_valid_i &&
  (fu_data_i.operation inside {DIV, DIVU, DIVW, DIVUW, REM, REMU, REMW, REMUW});

// Output arbitration: MUL results take priority over DIV results
// (multiplier is pipelined, divider supports backpressure)
assign div_ready_i      = (mul_valid) ? 1'b0 : 1'b1;  // stall divider output if MUL valid
assign mult_trans_id_o  = (mul_valid) ? mul_trans_id : div_trans_id;
assign result_o         = (mul_valid) ? mul_result    : div_result;
assign mult_valid_o     = div_valid | mul_valid;       // any result is valid
// ready_o: divider limits throughput (multiplier is always ready)
assign mult_ready_o = i_serdiv.in_rdy_o; // 0 while dividing`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "mult.sv itself has no state — it is a pure dispatcher and mux. All state lives in multiplier.sv (pipeline registers) and serdiv.sv (the iterative divide FSM).",
      "MUL priority over DIV: if both complete in the same cycle (extremely rare), MUL wins the output bus. The divider output is suppressed via div_ready_i=0. The divider will present its result again the next cycle.",
      "flush_i gates both dispatch signals: ~flush_i && mult_valid_i. A pipeline flush immediately prevents new operations from being dispatched. In-flight operations in multiplier.sv's pipeline are abandoned (their results are never asserted as valid)."
    ]
  },
  {
    module: "multiplier",
    path: "core/multiplier.sv",
    overview: "A 3-cycle pipelined multiplier relying on synthesizer retiming. Uses SystemVerilog's * operator mapped to Booth's multiplier by synthesis tools. Also handles CLMUL (carry-less multiplication) for the B extension. One pipeline register (trans_id, operation) between input and output.",
    internalLogic: `The multiplier is intentionally simple in RTL — it relies on the synthesis tool to implement an efficient Booth's algorithm multiplier from the * operator.

THE PIPELINE:
Stage 0 (combinational): compute the product
  product = operand_a_i * operand_b_i  (full 128-bit for MULH variants)

Stage 1 (pipeline register): latch the result + trans_id + valid
  On clock edge: mult_result_q <= product, trans_id_q <= trans_id_i, mult_valid_q <= mult_valid_i

Output: mult_valid_o = mult_valid_q, result_o = mult_result_q

The comment "This unit relies on retiming features of the synthesizer" means:
The synthesis tool may move the pipeline register across the multiplier logic to optimize timing.
Some synthesis tools implement a 3-stage Booth's multiplier and automatically insert registers
between the stages based on timing constraints (register retiming / pipelining).

MULH VARIANTS:
MUL:   result = (a × b)[63:0]   — lower 64 bits
MULH:  result = (signed_a × signed_b)[127:64]   — upper 64 bits, both signed
MULHU: result = (unsigned_a × unsigned_b)[127:64]  — upper 64 bits, both unsigned
MULHSU: result = (signed_a × unsigned_b)[127:64]   — upper 64 bits, mixed sign

For MULH variants, the multiplier computes a 128-bit product and extracts the upper half.

CLMUL (Carry-Less Multiplication, B extension):
Carry-less multiplication XORs partial products instead of adding them.
Used in cryptographic hash functions (CRC, AES GCM mode).
The CVA6 implementation uses a combinational loop that XORs shifted copies of operand_a:
  clmul_d = XOR(operand_a << i) for each bit i where operand_b[i]=1

WORD OPERATIONS (MULW):
For MULW (32-bit multiply producing 32-bit result sign-extended to 64):
  Use only operand_a[31:0] and operand_b[31:0]
  Sign-extend the 32-bit result to 64 bits`,
    alwaysBlocks: [
      {
        label: "Pipeline register + result mux (from multiplier.sv)",
        type: "seq",
        purpose: "Latches the multiplication result and transaction ID for 1 cycle pipeline delay",
        code: `// From core/multiplier.sv — Florian Zaruba, ETH Zurich
// "Multiplication Unit with one pipeline register"
// "This unit relies on retiming features of the synthesizer"

// ── FULL PRODUCT COMPUTATION (combinational) ─────────────────────────────
logic [63:0] operand_a, operand_b;
// Handle signed/unsigned and word operations
always_comb begin
  unique case (operation_i)
    MULW:   {operand_a, operand_b} = {{32{operand_a_i[31]}}, operand_a_i[31:0]},
                                      {{32{operand_b_i[31]}}, operand_b_i[31:0]};
    MULHU:  {operand_a, operand_b} = {operand_a_i, operand_b_i}; // unsigned
    MULHSU: {operand_a, operand_b} = {operand_a_i, operand_b_i}; // mixed
    default:{operand_a, operand_b} = {operand_a_i, operand_b_i}; // signed
  endcase
end

// The actual multiply — synthesis maps this to hardware multiplier
logic [127:0] mult_result;
assign mult_result = $signed(operand_a) * $signed(operand_b); // or unsigned variants

// ── PIPELINE REGISTER ────────────────────────────────────────────────────
logic [63:0]                   mult_result_q;
logic [CVA6Cfg.TRANS_ID_BITS-1:0] trans_id_q;
logic                          mult_valid_q;
logic [1:0]                    op_q;

always_ff @(posedge clk_i or negedge rst_ni) begin
  if (!rst_ni) begin
    mult_valid_q <= 1'b0;
    trans_id_q   <= '0;
    mult_result_q<= '0;
  end else begin
    mult_valid_q <= mult_valid_i;     // pipeline the valid strobe
    trans_id_q   <= trans_id_i;       // pipeline the trans_id for WB routing
    op_q         <= {is_mulh, is_signed}; // pipeline op type for result mux
    mult_result_q<= mult_result[63:0];    // lower 64 bits (default)
  end
end

// ── RESULT MUX: select correct product bits ───────────────────────────────
always_comb begin
  result_o = mult_result_q;
  unique case (op_q)
    2'b10: result_o = mult_result[127:64]; // MULH: upper 64 bits signed×signed
    2'b11: result_o = mult_result[127:64]; // MULHU: upper 64 bits unsigned
    default: result_o = mult_result[63:0]; // MUL/MULW: lower 64 bits
  endcase
end

assign mult_valid_o     = mult_valid_q;
assign mult_trans_id_o  = trans_id_q;`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "The comment 'relies on retiming features' is key: the RTL has exactly 1 explicit pipeline register, but synthesis tools like Synopsys DC or Cadence Genus may insert additional registers inside the multiplier array to meet timing. This is standard practice for arithmetic units.",
      "MULH, MULHU, MULHSU produce the upper 64 bits of a 128-bit product. The result mux uses op_q (pipelined operation type) to select upper vs lower bits. Computing the full 128-bit product and muxing is cheaper than having separate upper/lower multipliers.",
      "CLMUL uses XOR instead of ADD for partial products. This is implemented as a combinational loop: for each set bit in operand_b, XOR operand_a<<i into the accumulator. Synthesis optimizes this to a parallel XOR tree."
    ]
  },
  {
    module: "serdiv",
    path: "core/serdiv.sv",
    overview: "A 64-bit serial (iterative) SRT divider for DIV/DIVU/REM/REMU. Takes up to 64 cycles. Uses leading-zero counting (lzc) to pre-shift operands and skip leading zeros, reducing average iteration count. 3-state FSM: IDLE → DIVIDE → FINISH.",
    internalLogic: `SERIAL DIVISION ALGORITHM:
The serdiv uses a non-restoring/restoring binary long division. For unsigned division A/B:
  1. Pre-shift both operands using lzc to align A and B (normalize)
  2. Each cycle: shift the partial remainder left, subtract B if result ≥ 0,
     record quotient bit
  3. After WIDTH iterations (=64 by default): extract quotient and remainder
  4. Apply sign correction for signed operations

LZC-BASED OPTIMIZATION:
Two lzc instances count leading zeros in A (lzc_a) and B (lzc_b).
div_shift = lzc_b_result - lzc_a_result
Pre-shift B left by div_shift so the MSBs are aligned with A.
This reduces the number of iterations from always-64 to (64 - div_shift).
For small operands (e.g., A=5, B=3), this can reduce to just a few cycles.

SIGNED DIVISION:
opcode_i[0] = 1 means signed (DIV, REM), 0 means unsigned (DIVU, REMU).
For signed: take absolute values, perform unsigned division, then correct signs.
Sign correction: result is negative when signs of A and B differ (for division),
or same sign as A (for remainder).

SPECIAL CASES:
Division by zero: op_b_zero=1 — return 0xFFFF_FFFF_FFFF_FFFF (quotient), original A (remainder)
Division overflow (INT_MIN / -1): op_b_neg_one=1 with signed div — return INT_MIN (quotient), 0 (remainder)
These are RISC-V architectural requirements.

THE OUTPUT HANDSHAKE:
in_vld_i / in_rdy_o: input handshake (issue stage presents operation)
out_vld_o / out_rdy_i: output handshake (scoreboard accepts result)
While dividing, in_rdy_o=0 (cannot accept new operations).
When done, out_vld_o=1 and waits for out_rdy_i before returning to IDLE.`,
    alwaysBlocks: [
      {
        label: "always_comb : serdiv FSM + iteration logic",
        type: "comb",
        purpose: "Implements the serial division state machine and per-cycle bit computation",
        code: `// 3-state FSM: IDLE → DIVIDE → FINISH
enum logic [1:0] { IDLE, DIVIDE, FINISH } state;

always_comb begin : div_fsm
  state_d    = state_q;
  res_d      = res_q;
  op_a_d     = op_a_q;
  in_rdy_o   = 1'b0;
  out_vld_o  = 1'b0;
  cnt_d      = cnt_q;

  unique case (state_q)
    IDLE: begin
      in_rdy_o = 1'b1;  // ready to accept new operation
      if (in_vld_i) begin
        // Latch operands (after sign adjustment and pre-shift)
        op_a_d  = lzc_a_input;        // normalized dividend
        op_b_d  = op_b;               // pre-shifted divisor
        res_d   = '0;                 // clear result
        cnt_d   = div_shift[5:0];     // iteration count = 64 - leading_zeros_savings
        state_d = (div_res_zero_d) ? FINISH : DIVIDE; // fast-path if result is 0
      end
    end

    DIVIDE: begin
      // ONE ITERATION: shift partial remainder, subtract B if fits
      // add_mux = current partial remainder (left-shifted by 1)
      // add_out = partial_remainder - B
      // pm_sel  = 1 if subtraction result ≥ 0 (quotient bit = 1)

      // Shift and compute
      op_a_d = {op_a_q[WIDTH-2:0], 1'b0};  // shift A left (partial remainder)
      res_d  = {res_q[WIDTH-2:0], pm_sel};  // shift in quotient bit

      if (pm_sel) begin                      // subtraction was positive: accept
        op_a_d[WIDTH-1:1] = add_out[WIDTH-2:0];  // update partial remainder
      end

      cnt_d = cnt_q - 1;                    // decrement iteration counter
      if (cnt_zero) state_d = FINISH;       // all bits computed
    end

    FINISH: begin
      out_vld_o = 1'b1;   // result ready
      if (out_rdy_i) begin // downstream accepts result
        state_d = IDLE;
        in_rdy_o = 1'b1;  // ready for next operation
      end
    end
  endcase

  if (flush_i) begin
    state_d  = IDLE;
    in_rdy_o = 1'b1; // allow new operation after flush
  end
end`
      }
    ],
    stateMachines: [
      {
        name: "Division FSM",
        states: ["IDLE", "DIVIDE", "FINISH"],
        description: "Controls the iterative serial division. DIVIDE state runs for up to 64 cycles (one bit per cycle). FINISH waits for the downstream scoreboard to accept the result.",
        transitions: "IDLE→DIVIDE (in_vld_i, result not trivially zero) | IDLE→FINISH (division result is 0: fast path) | DIVIDE→FINISH (cnt_q==0: all bits computed) | FINISH→IDLE (out_rdy_i: scoreboard accepted result) | Any→IDLE (flush_i)"
      }
    ],
    keyDesignPoints: [
      "The LZC pre-shift optimization is critical for average-case performance. Two lzc instances run in parallel in the IDLE state. Their difference tells the FSM how many leading zero iterations to skip. For typical integer data, this often cuts the iteration count from 64 to 20-30.",
      "cnt_q is initialized to div_shift, not to WIDTH. This is what skips the leading zero iterations. The FSM counts DOWN from div_shift to 0, then moves to FINISH.",
      "Division is serialized: the issue stage deasserts mult_ready_o during a divide operation. No other multiply/divide instruction can be dispatched until the current division finishes. This is acceptable because division is rare in most code.",
      "flush_i handling: a flush during DIVIDE simply moves to IDLE and discards the partial result. No cleanup needed — the scoreboard has already cancelled the instruction via the cancelled bit."
    ]
  },

  // ── COMPRESSED DECODER ───────────────────────────────────────────────────
  {
    module: "compressed_decoder",
    path: "core/compressed_decoder.sv",
    overview: "Expands 16-bit RISC-V C extension instructions to their 32-bit equivalents. Pure combinational. Each C.* instruction maps 1:1 to a standard 32-bit RV instruction by reassembling bits from different positions.",
    internalLogic: `The RISC-V C extension defines 46 16-bit instructions in three quadrants (C0, C1, C2) identified by bits [1:0]. The compressed_decoder is a large always_comb case statement that:

1. Detects the quadrant from instr_i[1:0]
2. Detects the specific instruction from instr_i[15:13] (funct3)
3. Reassembles the bits into a standard 32-bit instruction

REGISTER ENCODING:
C instructions use 3-bit register fields (instr_i[4:2] and [9:7]) that reference the "popular" registers x8-x15 only. These are mapped to 5-bit register addresses by prepending "01": 3'b001 + rd' = x8+rd'.

EXAMPLE: C.ADD (add two registers)
  16-bit format: | funct4=1001 | rd | rs2 | C2 |
  Expands to: ADD rd, rd, rs2 (opcode=0110011, funct3=000, funct7=0000000)
  Bit reassembly: {7'b0, rs2, rd, 3'b000, rd, OpcodeRegReg}

EXAMPLE: C.LW (load word)
  16-bit format: | funct3=010 | uimm[5:3] | rs1' | uimm[2:6] | rd' | C0 |
  Expands to: LW rd', offset(rs1')
  The immediate is scattered: {3'b0, uimm[5:3], uimm[7:6], 2'b00} (word-aligned)
  Bit reassembly reconstructs the I-type immediate for the LW instruction

ILLEGAL INSTRUCTIONS:
Certain encodings are architecturally reserved (e.g., C.ADDI4SPN with immediate=0,
C.ADD with rs2=x0 is C.JR/JALR which is a different instruction class).
These set illegal_instr_o=1 and let the pipeline generate an illegal instruction exception.`,
    alwaysBlocks: [
      {
        label: "always_comb : compressed_decoder main case",
        type: "comb",
        purpose: "Maps each C-extension instruction to its 32-bit RV equivalent via bit reassembly",
        code: `// From core/compressed_decoder.sv — actual code (excerpt)
// Shows how C.ADDI4SPN, C.FLD, C.LW expand to 32-bit equivalents

always_comb begin
  illegal_instr_o = 1'b0;
  is_compressed_o = 1'b1;
  instr_o         = instr_i;  // default: pass through

  unique case (instr_i[1:0])  // quadrant: C0, C1, or C2

    // ── QUADRANT C0 ───────────────────────────────────────────────────────
    riscv::OpcodeC0: begin
      unique case (instr_i[15:13])  // funct3

        // C.ADDI4SPN → ADDI rd', x2, nzuimm
        // CIW: | funct3=000 | nzuimm[5:4|9:6|2|3] | rd' | C0 |
        riscv::OpcodeC0Addi4spn: begin
          instr_o = {
            2'b0,
            instr_i[10:7],    // nzuimm[9:6]
            instr_i[12:11],   // nzuimm[5:4]
            instr_i[5],       // nzuimm[3]
            instr_i[6],       // nzuimm[2]
            2'b00,            // nzuimm[1:0] = 0 (word-aligned)
            5'h02,            // rs1 = x2 (stack pointer)
            3'b000,           // ADDI funct3
            2'b01, instr_i[4:2], // rd' → x(8+rd')
            riscv::OpcodeOpImm  // opcode = OP-IMM
          };
          if (instr_i[12:5] == 8'b0) illegal_instr_o = 1'b1; // nzuimm must not be 0
        end

        // C.LW → LW rd', offset(rs1')
        // CL: | funct3=010 | uimm[5:3] | rs1' | uimm[2|6] | rd' | C0 |
        riscv::OpcodeC0Lw: begin
          instr_o = {
            5'b0,
            instr_i[5],     // uimm[6]
            instr_i[12:10], // uimm[5:3]
            instr_i[6],     // uimm[2]
            2'b00,          // uimm[1:0] = 0 (word-aligned)
            2'b01, instr_i[9:7],  // rs1' = x(8+rs1')
            3'b010,         // LW funct3
            2'b01, instr_i[4:2],  // rd' = x(8+rd')
            riscv::OpcodeLoad
          };
        end

        // ... (C0 has 8 funct3 encodings: loads, stores, C.UNDEF)
      endcase
    end

    // ── QUADRANT C1 (arithmetic/branches) ────────────────────────────────
    riscv::OpcodeC1: begin
      unique case (instr_i[15:13])
        // C.ADDI → ADDI rd, rd, nzimm
        riscv::OpcodeC1Addi: begin
          instr_o = {
            {6{instr_i[12]}},   // sign-extend imm[5]
            instr_i[12],        // imm[5]
            instr_i[6:2],       // imm[4:0]
            instr_i[11:7],      // rd (full 5-bit, any register)
            3'b0,               // ADDI funct3
            instr_i[11:7],      // rd = rs1 (ADDI rd, rd, imm)
            riscv::OpcodeOpImm
          };
          // C.NOP: ADDI x0, x0, 0 — valid but do nothing
        end
        // ... (C1 has branches BEQ/BNE, jumps J/JAL, LI, LUI, ADDI16SP, misc)
      endcase
    end

    // ── QUADRANT C2 (register-register ops) ──────────────────────────────
    riscv::OpcodeC2: begin
      unique case (instr_i[15:13])
        // C.ADD → ADD rd, rd, rs2
        riscv::OpcodeC2Add: begin
          if (instr_i[12] == 1'b0) begin
            if (instr_i[6:2] != 5'b0) begin
              instr_o = {   // C.MV → ADD rd, x0, rs2
                7'b0, instr_i[6:2], 5'b0, 3'b0,
                instr_i[11:7], riscv::OpcodeRegReg
              };
            end else begin  // C.JR → JALR x0, 0(rs1)
              instr_o = {12'b0, instr_i[11:7], 3'b0, 5'b0, riscv::OpcodeJalr};
            end
          end else begin
            if (instr_i[11:2] == 10'b0) begin
              instr_o = 32'h00100073; // C.EBREAK → EBREAK
            end else if (instr_i[6:2] != 5'b0) begin
              instr_o = {  // C.ADD → ADD rd, rd, rs2
                7'b0, instr_i[6:2], instr_i[11:7], 3'b0,
                instr_i[11:7], riscv::OpcodeRegReg
              };
            end else begin  // C.JALR → JALR x1, 0(rs1)
              instr_o = {12'b0, instr_i[11:7], 3'b0, 5'b1, riscv::OpcodeJalr};
            end
          end
        end
      endcase
    end
  endcase
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "The compressed_decoder is 100% combinational — no state, no clock. It is a pure bit-reassembly circuit that runs in the same cycle as the instruction arrives from the frontend.",
      "3-bit register addresses in C instructions (rd', rs1', rs2') map to 5-bit using 2'b01 prefix: x8 through x15. These are the 'popular' registers most frequently used in compiled code, chosen by the ISA architects based on profiling data.",
      "C.JR and C.JALR share the same 16-bit encoding with different funct4 bits. C.JR (instr_i[12]=0, rs2=0) expands to JALR x0, rs1, 0. C.JALR (instr_i[12]=1, rs2=0) expands to JALR x1, rs1, 0. The compressed_decoder must distinguish these carefully.",
      "is_compressed_o=1 feeds through the pipeline to commit_stage, which uses it to advance PC by +2 instead of +4 after committing this instruction. Missing this bit would cause the PC to advance too far and corrupt control flow."
    ]
  },

  // ── CACHE CONTROLLER ─────────────────────────────────────────────────────
  {
    module: "cache_ctrl",
    path: "core/cache_subsystem/cache_ctrl.sv",
    overview: "The D-cache controller handles one request port (load or store). An 11-state FSM sequences: address presentation → tag lookup → hit/miss decision → refill request → critical word return → replay. Also handles the bypass path for uncacheable regions.",
    internalLogic: `The cache_ctrl is the per-port state machine that manages the handshake between the CPU (load_unit/store_unit) and the SRAM arrays + miss handler.

CACHE ORGANIZATION:
CVA6's D-cache is 4-way set-associative (DCACHE_SET_ASSOC=4).
Index bits select the set, tag bits identify the line, offset bits select the word within the line.
The SRAM arrays are: tag_array[sets][ways] and data_array[sets][ways].

CACHE LOOKUP SEQUENCE:
Cycle 0: address arrives from CPU
  → send index bits to SRAM: req_o, addr_o = index
  → also send tag for later compare: tag_o = tag bits

Cycle 1: SRAM read completes
  → hit_way_i: one-hot vector, bit i=1 if way i has a valid tag match
  → data_i: all 4 ways' data returned simultaneously
  → Select data: for loop over hit_way_i to find which way's data to use

HIT PATH (state WAIT_TAG → IDLE):
If any bit in hit_way_i is set: cache hit.
Return critical_word from the matching way's data.
Advance to IDLE, ready for next request.

MISS PATH (state WAIT_TAG → WAIT_REFILL_GNT):
If no hit: assert miss_req_o to the miss handler.
Miss handler fetches from L2/DRAM via AXI.
critical_word_valid_i fires when the first 8-byte chunk returns (critical word first).
The CPU can use this data immediately (state WAIT_CRITICAL_WORD).
Remaining cache-line bytes arrive later and are written to SRAM.

BYPASS PATH (uncacheable regions):
For I/O-mapped addresses (non-cacheable): bypass the SRAM arrays entirely.
Use the bypass interface: bypass_gnt_i / bypass_valid_i / bypass_data_i.
This path is taken when bypass_i is asserted (the PMA/PMP checker identified this as uncacheable).

MSHR ALIASING CHECK:
MSHR (Miss Status Holding Register) tracks in-flight cache misses.
mshr_addr_o: address of the current miss request.
mshr_addr_matches_i: another request is waiting for the same cache line.
mshr_index_matches_i: a request has the same set index (may conflict with refill).
The FSM enters WAIT_MSHR state when a new request conflicts with an in-flight miss.`,
    alwaysBlocks: [
      {
        label: "always_comb : cache_ctrl_fsm (11-state FSM)",
        type: "comb",
        purpose: "Main cache request state machine: sequences address→lookup→hit/miss→refill",
        code: `// 11 states from cache_ctrl.sv — actual enum
enum logic [3:0] {
  IDLE,              // 0: waiting for new request
  WAIT_TAG,          // 1: SRAM read issued, waiting for tag comparison result
  WAIT_TAG_BYPASSED, // 2: SRAM read for bypass check
  WAIT_GNT,          // 3: waiting for SRAM grant (busy)
  WAIT_GNT_SAVED,    // 4: saved request, waiting for SRAM grant
  STORE_REQ,         // 5: processing a store request
  WAIT_REFILL_VALID, // 6: miss sent to L2, waiting for critical word
  WAIT_REFILL_GNT,   // 7: have critical word, waiting for SRAM write grant
  WAIT_TAG_SAVED,    // 8: tag check for saved request
  WAIT_MSHR,         // 9: index matches outstanding miss, must wait
  WAIT_CRITICAL_WORD // 10: critical word arrived, deliver to CPU
} state_d, state_q;

// Simplified key transitions:
always_comb begin : cache_ctrl_fsm
  unique case (state_q)
    IDLE: begin
      if (req_port_i.data_req) begin
        req_o  = '1;          // request all ways simultaneously
        addr_o = req_port_i.address_index;  // set index → SRAM
        tag_o  = req_port_i.address_tag;    // tag (available next cycle)
        state_d = WAIT_TAG;
      end
    end

    WAIT_TAG: begin
      // SRAM returned: check hit_way_i
      if (|hit_way_i) begin
        // HIT: extract data from matching way
        cl_i = data_i[hit_way_index].data; // hit way data
        req_port_o.data_rvalid = 1'b1;
        req_port_o.data_rdata  = cl_i[cl_offset +: XLEN]; // word-aligned extract
        state_d = IDLE;
      end else if (mshr_index_matches_i) begin
        // CONFLICT: same index as outstanding miss — wait
        state_d = WAIT_MSHR;
      end else begin
        // MISS: request refill from L2
        miss_req_o.valid  = 1'b1;
        miss_req_o.addr   = {req_port_i.address_tag, req_port_i.address_index};
        state_d = WAIT_REFILL_VALID;
      end
    end

    WAIT_REFILL_VALID: begin
      // Waiting for critical word from L2/DRAM via AXI adapter
      if (critical_word_valid_i) begin
        req_port_o.data_rvalid = 1'b1;
        req_port_o.data_rdata  = critical_word_i; // deliver to CPU immediately
        state_d = WAIT_REFILL_GNT; // still need to write to SRAM
      end
    end

    WAIT_REFILL_GNT: begin
      // Write refilled line to SRAM (install in cache)
      if (miss_gnt_i) begin
        we_o    = 1'b1;     // write enable to SRAM
        state_d = IDLE;
      end
    end

    WAIT_MSHR: begin
      // Wait until the conflicting miss resolves
      if (!mshr_index_matches_i) state_d = WAIT_GNT; // retry
    end
  endcase
end`
      }
    ],
    stateMachines: [
      {
        name: "Cache Request FSM",
        states: ["IDLE", "WAIT_TAG", "WAIT_TAG_BYPASSED", "WAIT_GNT", "WAIT_GNT_SAVED", "STORE_REQ", "WAIT_REFILL_VALID", "WAIT_REFILL_GNT", "WAIT_TAG_SAVED", "WAIT_MSHR", "WAIT_CRITICAL_WORD"],
        description: "Manages the lifecycle of a single cache request from address presentation to data return or cache fill",
        transitions: "IDLE→WAIT_TAG (request) | WAIT_TAG→IDLE (hit) | WAIT_TAG→WAIT_REFILL_VALID (miss) | WAIT_TAG→WAIT_MSHR (index conflict) | WAIT_REFILL_VALID→WAIT_REFILL_GNT (critical word arrives) | WAIT_REFILL_GNT→IDLE (SRAM write complete)"
      }
    ],
    keyDesignPoints: [
      "Critical word first: on a cache miss, CVA6 can deliver the needed data word to the CPU before the entire cache line has been fetched. The state WAIT_CRITICAL_WORD handles this. The rest of the line arrives asynchronously and is installed in SRAM.",
      "The WAIT_MSHR state handles a subtle conflict: if two requests target the same set simultaneously (same index bits) and the first causes a miss, the second must wait for the refill to complete before it can do its own tag lookup. Without WAIT_MSHR, the second request might try to allocate a new MSHR entry for what is actually the same miss.",
      "busy_o = (state_q != IDLE). The cache presents this to the D-cache top level as an indication that this port is active. The D-cache top level uses this to prevent issuing new requests to a busy port.",
      "STORE_REQ state handles write requests. A store in the cache is a read-modify-write: read the existing cache line, modify the specific bytes using byte enables (be), write back the modified line. This is why stores take 2 SRAM cycles instead of 1."
    ]
  },

  // ── AXI ADAPTER ──────────────────────────────────────────────────────────
  {
    module: "axi_adapter",
    path: "core/cache_subsystem/axi_adapter.sv",
    overview: "Converts CVA6's internal cache miss/refill request format to AXI4 burst transactions. Handles both read (cache miss refill) and write (cache eviction / store) channels. 10-state FSM manages AXI handshakes, burst counting, and response handling.",
    internalLogic: `The AXI4 protocol has 5 independent channels:
  AR (Read Address): master → slave, address + burst info
  R  (Read Data):    slave → master, data + last flag
  AW (Write Address): master → slave
  W  (Write Data):    master → slave, data + strobe
  B  (Write Response): slave → master, acknowledgment

Each channel uses a valid/ready handshake — a transfer occurs when both valid AND ready are asserted.

CVA6's AXI adapter translates:
  READ REQUEST (cache miss):
    req_i=1, we_i=0 → issue AR transaction → collect R burst → deliver data_o

  WRITE REQUEST (store or eviction):
    req_i=1, we_i=1 → issue AW + W transactions → wait for B response

BURST READS:
A cache line is typically 256 bits (4 × 64-bit words).
One AXI read burst fetches the entire line: AR with LEN=BURST_SIZE (=3 for 256/64-1).
The R channel returns 4 data beats, each BURST_SIZE=64 bits.
cnt_q tracks which beat we're on: increments on each R handshake.
The critical_word is the beat that matches the requested word's offset.

OUTSTANDING WRITE COUNTER:
AXI allows multiple outstanding write transactions (pipelining WA/W/B).
outstanding_aw_cnt_q counts AW transactions that haven't received B responses yet.
If outstanding_aw_cnt_q == MAX_OUTSTANDING_AW: stop issuing new AW transactions.

AMO SUPPORT:
For atomic operations (LR/SC, AMOSWAP): amo_i carries the operation type.
The adapter uses AXI exclusive access (LOCK=1) for LR/SC.
AMOs go through the WAIT_AMO_R_VALID state which handles the read-modify-write.`,
    alwaysBlocks: [
      {
        label: "always_comb : axi_fsm (10-state AXI transaction FSM)",
        type: "comb",
        purpose: "Manages AXI4 channel handshakes for cache reads (refill) and writes (eviction/store)",
        code: `// 10-state AXI FSM — actual states from axi_adapter.sv
enum logic [3:0] {
  IDLE,
  WAIT_B_VALID,            // waiting for write response on B channel
  WAIT_AW_READY,           // AW transaction in progress
  WAIT_LAST_W_READY,       // all W beats sent, waiting for last W ready
  WAIT_LAST_W_READY_AW_READY,  // both AW and last W waiting
  WAIT_AW_READY_BURST,     // burst write, AW waiting
  WAIT_R_VALID,            // waiting for first R beat (cache line refill)
  WAIT_R_VALID_MULTIPLE,   // collecting multiple R beats (burst)
  COMPLETE_READ,           // all R beats received, deliver to cache
  WAIT_AMO_R_VALID         // AMO: waiting for exclusive read
} state_q, state_d;

always_comb begin : axi_fsm
  // ── READ PATH (cache miss refill) ──────────────────────────────────────
  unique case (state_q)
    IDLE: begin
      if (req_i) begin
        if (!we_i) begin  // READ request
          axi_req_o.ar_valid = 1'b1;
          axi_req_o.ar.addr  = addr_i;
          axi_req_o.ar.len   = BURST_SIZE[7:0]; // e.g., 3 for 4-beat burst
          axi_req_o.ar.size  = 3'b011;          // 8 bytes per beat
          axi_req_o.ar.burst = axi_pkg::BURST_INCR;
          if (axi_resp_i.ar_ready) begin
            gnt_o   = 1'b1;  // immediately grant to cache ctrl
            state_d = WAIT_R_VALID;
          end
        end else begin    // WRITE request
          axi_req_o.aw_valid = 1'b1;
          axi_req_o.aw.addr  = addr_i;
          axi_req_o.w_valid  = 1'b1;
          // Fill W data from wdata_i[cnt_q]
          axi_req_o.w.data   = wdata_i[0];
          axi_req_o.w.strb   = be_i[0];
          if (axi_resp_i.aw_ready && axi_resp_i.w_ready)
            state_d = (BURST_SIZE > 0) ? WAIT_LAST_W_READY : WAIT_B_VALID;
        end
      end
    end

    WAIT_R_VALID: begin
      // Collecting R burst beats
      axi_req_o.r_ready = 1'b1; // always ready to accept data
      if (axi_resp_i.r_valid) begin
        cache_line_d[cnt_q] = axi_resp_i.r.data; // store in cache line buffer

        // Critical word: the beat that matches the requested word's offset
        if (cnt_q == index) begin
          critical_word_o       = axi_resp_i.r.data;
          critical_word_valid_o = 1'b1; // CPU can use this data NOW
        end

        cnt_d = cnt_q + 1;  // advance beat counter
        if (axi_resp_i.r.last) begin  // last beat of burst
          valid_o = 1'b1;   // entire cache line delivered
          state_d = IDLE;
        end
      end
    end

    WAIT_B_VALID: begin
      // Write: waiting for B response (write acknowledgment)
      axi_req_o.b_ready = 1'b1;
      if (axi_resp_i.b_valid) begin
        state_d = IDLE;
        outstanding_aw_cnt_d = outstanding_aw_cnt_q - 1;
      end
    end
  endcase
end`
      }
    ],
    stateMachines: [
      {
        name: "AXI Transaction FSM",
        states: ["IDLE", "WAIT_B_VALID", "WAIT_AW_READY", "WAIT_LAST_W_READY", "WAIT_LAST_W_READY_AW_READY", "WAIT_AW_READY_BURST", "WAIT_R_VALID", "WAIT_R_VALID_MULTIPLE", "COMPLETE_READ", "WAIT_AMO_R_VALID"],
        description: "Manages AXI4 channel handshakes for cache miss refill (AR/R channels) and cache eviction/store writeback (AW/W/B channels)",
        transitions: "IDLE→WAIT_R_VALID (read, AR accepted) | WAIT_R_VALID→IDLE (R.last received, cache line complete) | IDLE→WAIT_B_VALID (write, AW+W sent) | WAIT_B_VALID→IDLE (B response received)"
      }
    ],
    keyDesignPoints: [
      "Critical word first is a key latency optimization: the cache_ctrl can deliver the CPU-requested word to the load_unit as soon as the matching AXI R beat arrives, without waiting for the full cache line. This reduces load-to-use latency on cache misses from (full_burst_cycles) to (first_beat_cycles).",
      "outstanding_aw_cnt_q limits write pipeline depth. AXI4 allows pipelining multiple write transactions (issue AW, then AW again before the first B response). CVA6 limits this to MAX_OUTSTANDING_STORES to prevent overflowing the write buffer at the slave.",
      "BURST_SIZE = DATA_WIDTH / AxiDataWidth - 1. For a 256-bit cache line with 64-bit AXI data width: BURST_SIZE = 256/64 - 1 = 3. This means 4 AXI beats per cache line refill.",
      "cnt_q and cache_line buffer: as R beats arrive, they're stored in cache_line_d[cnt_q] where cnt_q tracks the beat number. After the last beat, the complete cache_line_q is passed back to the cache SRAM for installation."
    ]
  },

  // ── CVA6 TOP ─────────────────────────────────────────────────────────────
  {
    module: "cva6",
    path: "core/cva6.sv",
    overview: "The top-level CPU module. Defines all inter-stage packed structs as localparam types, instantiates every pipeline stage, and wires them together. No logic lives here — it is pure structure.",
    internalLogic: `cva6.sv is the integration point. Its job is to:
1. Define all shared data types as localparam packed structs (scoreboard_entry_t, fetch_entry_t, fu_data_t, bp_resolve_t, exception_t, etc.)
2. Instantiate all pipeline stages and connect their ports

DATA TYPES DEFINED HERE:
Every module in CVA6 receives its data types as parameter types rather than importing them from a package. This enables the same RTL to be instantiated at different widths (RV32 vs RV64) by changing CVA6Cfg without touching any submodule code.

Key structs (all defined as localparam type in cva6.sv):
  fetch_entry_t:       Frontend → Decode    (instruction word, PC, branch prediction, exception)
  scoreboard_entry_t:  Decode → Issue → Execute → Commit (the instruction's identity card)
  fu_data_t:           Issue → Functional Units (resolved operands, operation, trans_id)
  bp_resolve_t:        Execute → Frontend (branch resolution: actual target, is_mispredict)
  exception_t:         Embedded everywhere (cause, tval, valid)
  writeback_t:         FU → Scoreboard (trans_id, result, exception)

INSTANTIATION CONNECTIONS:
The key signal flows between instances:
  frontend → id_stage:   fetch_entry_o/fetch_entry_i  (NrIssuePorts bundles)
  id_stage → scoreboard: decoded_instr_o/decoded_instr_i
  scoreboard → issue:    issue_instr_o (dispatch to FUs)
  scoreboard → commit:   commit_instr_o (oldest N instructions)
  ex_stage → scoreboard: wbdata_o (NrWbPorts writeback buses)
  ex_stage → frontend:   resolved_branch_o (misprediction feedback)
  commit_stage → csr:    exception_o, csr_op_o, commit_ack_o
  csr → frontend:        trap_vector_base_o, epc_o, eret_o
  controller → all:      flush_if_o, flush_id_o, flush_ex_o, halt_o`,
    alwaysBlocks: [],
    stateMachines: [],
    keyDesignPoints: [
      "No logic in cva6.sv — only type definitions and instantiation. Every signal connection is a direct port assignment. This makes the design easy to trace: to find where a signal comes from, look at this file.",
      "Parameterized types enable single-source RTL for RV32/RV64. The same frontend.sv works for both — only the struct widths change via CVA6Cfg parameters.",
      "NrIssuePorts controls superscalar width. Setting NrIssuePorts=2 gives 2-wide fetch/decode/issue without changing any submodule logic — the arrays just get 2 entries.",
      "The AXI interfaces (axi_req_o, axi_resp_i) are the only external interfaces — CVA6 is a core, not an SoC. All instruction fetch and data memory accesses exit through these ports."
    ]
  },

  // ── FRONTEND ──────────────────────────────────────────────────────────────
  {
    module: "frontend",
    path: "core/frontend/frontend.sv",
    overview: "Instruction fetch frontend. Generates next PC (priority mux with 7 sources), issues I-cache requests, runs branch prediction (BHT+BTB+RAS), handles compressed instruction alignment, and produces fetch_entry_t for decode via a fetch queue.",
    internalLogic: `PC GENERATION MUX (priority, highest first):
  1. set_debug_pc_i      → debug ROM
  2. ex_valid_i          → trap_vector_base_i
  3. eret_i              → epc_i  
  4. set_pc_commit_i     → pc_commit_i (CSR/fence restart)
  5. resolved_branch_i.is_mispredict → resolved_branch_i.target_address
  6. BHT taken + BTB hit → btb_prediction.target_address
  7. default             → PC + 4 (or +2 for compressed)

FETCH QUEUE:
A small FIFO (fifo_v3) between the I-cache response and the decode stage.
Absorbs I-cache hit latency variation. Allows decode to consume instructions when the cache has a hit even if the next fetch hasn't returned yet.
Depth: typically 2–4 entries.

COMPRESSED HANDLING:
FETCH_WIDTH = 64 bits = 2 instructions (or up to 4 compressed).
The frontend must detect 16-bit instructions (bits[1:0] != 2'b11) and split the 64-bit fetch into individual instruction slots.
Boundary crossing: a 32-bit instruction whose first halfword is at offset 3 of a cache line requires stitching two fetch responses — handled by a 16-bit holding register.

BHT UPDATE:
On resolved_branch_i: update BHT entry at resolved_branch_i.pc with actual direction.
Update BTB entry at same PC with actual target_address.
Updates happen even for correctly-predicted branches — the 2-bit counter still needs incrementing.`,
    alwaysBlocks: [
      {
        label: "always_comb : npc_select (next PC selection mux)",
        type: "comb",
        purpose: "Selects the next fetch PC from 7 possible sources in priority order",
        code: `// Next PC mux — priority encoded (simplified from frontend.sv)
always_comb begin : npc_select
  npc = pc_q + (is_compressed ? 'd2 : 'd4); // default: sequential

  // Priority 1: debug redirect
  if (set_debug_pc_i)
    npc = debug_pc_i;
  // Priority 2: exception trap
  else if (ex_valid_i)
    npc = trap_vector_base_i;
  // Priority 3: return from exception
  else if (eret_i)
    npc = epc_i;
  // Priority 4: CSR side-effect / fence restart
  else if (set_pc_commit_i)
    npc = pc_commit_i;
  // Priority 5: branch misprediction correction
  else if (resolved_branch_i.valid && resolved_branch_i.is_mispredict)
    npc = resolved_branch_i.target_address;
  // Priority 6: branch predictor says taken
  else if (bht_prediction.taken && btb_prediction.valid)
    npc = btb_prediction.target_address;
  // Priority 7: return address stack (for function returns)
  else if (cf_type == RETURN)
    npc = ras_top;
  // Default: PC + 4 (or PC + 2 for compressed)
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "halt_i and halt_frontend_i are distinct: halt_i freezes everything including decode; halt_frontend_i only stops new fetch requests (used during fence.i when I-cache is being flushed).",
      "The fetch queue provides decoupling: even with 1–2 cycle I-cache latency, decode can continue consuming queued instructions while the next fetch is in-flight.",
      "kill_s1/kill_s2 in icache_dreq_t handle the 2-stage I-cache pipeline: stage 1 = index lookup, stage 2 = tag compare. A flush must kill both in-flight stages to prevent stale responses."
    ]
  },

  // ── BHT ───────────────────────────────────────────────────────────────────
  {
    module: "bht",
    path: "core/frontend/bht.sv",
    overview: "2-bit saturating counter Branch History Table. 1024 entries indexed by PC bits. Prediction = counter MSB. Updated by the execute stage after every branch resolves. Supports FPGA (BRAM) and ASIC (flip-flop) targets.",
    internalLogic: `STRUCTURE: bht_q[NR_ROWS][INSTR_PER_FETCH] of {valid, saturation_counter[1:0]}
INDEXING: index = vpc_i[PREDICTION_BITS-1 : ROW_ADDR_BITS+OFFSET]
  Skip low bits (OFFSET=1 for RVC since instructions are 2-byte aligned)
PREDICTION: taken = bht_q[index][row_index].saturation_counter[1]  (MSB=1 → taken)
UPDATE: on bht_update_i.valid:
  taken  → counter = min(counter+1, 2'b11)  (saturate at strongly-taken)
  !taken → counter = max(counter-1, 2'b00)  (saturate at strongly-not-taken)
FLUSH: flush_bp_i clears all valid bits (on fence.i or context switch)`,
    alwaysBlocks: [
      {
        label: "always_comb : update_bht (saturation counter update logic)",
        type: "comb",
        purpose: "Updates the 2-bit saturating counter based on actual branch outcome",
        code: `always_comb begin : update_bht
  bht_d = bht_q;
  logic [1:0] sat = bht_q[update_pc][update_row_index].saturation_counter;

  if (bht_update_i.valid && !debug_mode_i) begin
    bht_d[update_pc][update_row_index].valid = 1'b1;
    if      (sat == 2'b11 && !bht_update_i.taken) bht_d[...].saturation_counter = 2'b10;
    else if (sat == 2'b00 &&  bht_update_i.taken) bht_d[...].saturation_counter = 2'b01;
    else if (bht_update_i.taken)  bht_d[...].saturation_counter = sat + 1;
    else                          bht_d[...].saturation_counter = sat - 1;
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "2-bit counter provides hysteresis: a single misprediction doesn't flip the prediction. A strongly-taken branch needs 2 not-taken outcomes to flip to not-taken prediction.",
      "INSTR_PER_FETCH sub-entries per row: in 2-wide fetch, each row has 2 counters — one per instruction slot. This avoids aliasing between two instructions at consecutive addresses.",
      "bht2lvl.sv (gshare) is the alternative: XOR of GHR (global history register) with PC as the index. Captures cross-branch correlation. Selectable via config."
    ]
  },

  // ── ID_STAGE ──────────────────────────────────────────────────────────────
  {
    module: "id_stage",
    path: "core/id_stage.sv",
    overview: "Decode stage wrapper. Instantiates one decoder per issue port. Handles compressed expansion, interrupt injection, and produces scoreboard_entry_t. Implements the frontend/decode ready-valid handshake.",
    internalLogic: `id_stage.sv is thin — it instantiates decoder.sv for each issue port and handles the pipeline handshake.

HANDSHAKE LOGIC:
fetch_entry_ready_o: deasserted when scoreboard is full (issue_instr_ack_i deasserted from scoreboard)
The pipeline stalls by deasserting fetch_entry_ready_o, which backs up to the frontend fetch queue.

INTERRUPT INJECTION:
If irq_ctrl_i.global_enable && (irq_ctrl_i.mip & irq_ctrl_i.mie) != 0:
  Inject a special scoreboard_entry_t with ex.valid=1 and the interrupt cause code.
  The instruction that would have been decoded is NOT discarded — it waits.
  The interrupt exception entry goes first, then the interrupted instruction re-enters.
  At commit, the interrupt causes a trap to the handler. MRET returns to the interrupted instruction's PC.

WHY INTERRUPT AT DECODE (not at fetch)?
  At decode, we have a precise instruction boundary.
  The interrupt exception follows normal pipeline flow to commit.
  This gives ~5 cycle interrupt latency from detection to handler.`,
    alwaysBlocks: [
      {
        label: "always_comb : interrupt check and injection",
        type: "comb",
        purpose: "Injects interrupt as a fake exception scoreboard entry at instruction boundaries",
        code: `// Simplified interrupt injection logic in id_stage
always_comb begin
  // Default: pass decoded instruction to scoreboard
  issue_entry_o      = decoded_instr;
  issue_entry_valid_o = fetch_entry_valid_i & fetch_entry_ready_o;

  // Check if interrupt should be taken at this instruction boundary
  if (irq_ctrl_i.global_enable &&
      |(irq_ctrl_i.mip & irq_ctrl_i.mie & ~irq_ctrl_i.mideleg)) begin
    // Override: inject interrupt as exception with interrupt cause
    issue_entry_o.ex.valid = 1'b1;
    issue_entry_o.ex.cause = {1'b1, interrupt_cause}; // bit 63 set = interrupt
    issue_entry_o.ex.tval  = '0;
    issue_entry_valid_o    = 1'b1;
    // Hold the real instruction — it will be decoded again after MRET
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "Interrupt injection happens at id_stage, not in the CSR file or commit stage. This means the interrupt exception enters the scoreboard like any other instruction and takes ~5 cycles to reach commit.",
      "is_ctrl_flow_o is a separate output (not in scoreboard_entry_t) because the frontend needs it immediately to update the BHT — 1 cycle before the full scoreboard_entry_t is consumed by the scoreboard."
    ]
  },

  // ── DECODER ───────────────────────────────────────────────────────────────
  {
    module: "decoder",
    path: "core/decoder.sv",
    overview: "Pure combinational ISA decoder. Maps 32-bit instruction → scoreboard_entry_t. Handles all RV64GC opcodes plus B/H/Zicsr/Zcmp/Zcmt/hypervisor extensions. The largest always_comb block in the design.",
    internalLogic: `The decoder is a single large always_comb block with a nested case structure:
  outer case: instruction[6:0] (opcode)
  inner case: instruction[14:12] (funct3) and/or instruction[31:25] (funct7)

OUTPUT FIELDS SET BY DECODER:
  fu:       which functional unit (ALU/CTRL_FLOW/LOAD/STORE/MULT/CSR/FPU)
  op:       specific operation enum value
  rs1/rs2/rd: extracted from fixed bit positions [19:15]/[24:20]/[11:7]
  result:   holds the sign-extended immediate (before execution; overwritten with result after)
  use_imm:  1 if operand_b should come from the immediate (I/S/B/U/J types)
  use_pc:   1 if operand_a should be the PC (AUIPC, JAL)
  ex:       illegal instruction exception if no valid encoding found

IMMEDIATE FORMATS (6 total):
  I: {inst[31:20]}                              → ADDI, LOAD, JALR
  S: {inst[31:25], inst[11:7]}                  → STORE
  B: {inst[31],inst[7],inst[30:25],inst[11:8],0} → BRANCH
  U: {inst[31:12], 12'b0}                       → LUI, AUIPC
  J: {inst[31],inst[19:12],inst[20],inst[30:21],0} → JAL
  Z: {59'b0, inst[19:15]}                       → CSR zimm`,
    alwaysBlocks: [
      {
        label: "always_comb : decode (opcode dispatch, actual structure)",
        type: "comb",
        purpose: "Maps every RISC-V opcode to fu/op/immediate/flags in scoreboard_entry_t",
        code: `always_comb begin : decode
  // Defaults
  instruction_o.fu      = NONE; instruction_o.op = ADD;
  instruction_o.use_imm = 1'b0; instruction_o.use_pc = 1'b0;
  instruction_o.result  = '0;   illegal_instr = 1'b0;

  // Register addresses: fixed bit positions in all formats
  instruction_o.rs1 = instr.rtype.rs1;   // [19:15]
  instruction_o.rs2 = instr.rtype.rs2;   // [24:20]
  instruction_o.rd  = instr.rtype.rd;    // [11:7]

  unique case (instr.rtype.opcode)
    riscv::OpcodeLoad: begin
      instruction_o.fu      = LOAD;
      instruction_o.result  = imm_i_type;  // base + offset
      instruction_o.use_imm = 1'b1;
      unique case (instr.itype.funct3)
        3'b000: instruction_o.op = LB;   3'b001: instruction_o.op = LH;
        3'b010: instruction_o.op = LW;   3'b011: instruction_o.op = LD;
        3'b100: instruction_o.op = LBU;  3'b101: instruction_o.op = LHU;
        3'b110: instruction_o.op = LWU;
        default: illegal_instr = 1'b1;
      endcase
    end
    riscv::OpcodeStore: begin
      instruction_o.fu      = STORE;
      instruction_o.result  = imm_s_type;
      instruction_o.use_imm = 1'b1;
      unique case (instr.stype.funct3)
        3'b000: instruction_o.op = SB; 3'b001: instruction_o.op = SH;
        3'b010: instruction_o.op = SW; 3'b011: instruction_o.op = SD;
        default: illegal_instr = 1'b1;
      endcase
    end
    riscv::OpcodeBranch: begin
      instruction_o.fu     = CTRL_FLOW;
      instruction_o.result = imm_b_type; // branch offset
      unique case (instr.btype.funct3)
        3'b000: instruction_o.op = EQ;  3'b001: instruction_o.op = NE;
        3'b100: instruction_o.op = LTS; 3'b101: instruction_o.op = GES;
        3'b110: instruction_o.op = LTU; 3'b111: instruction_o.op = GEU;
        default: illegal_instr = 1'b1;
      endcase
    end
    riscv::OpcodeRegImm: begin  // I-type ALU
      instruction_o.fu = ALU; instruction_o.result = imm_i_type;
      instruction_o.use_imm = 1'b1;
      // ... funct3 selects ADD/SLT/AND/OR/XOR/SLL/SRL/SRA
    end
    // ... JAL, JALR, LUI, AUIPC, R-type, CSR, SYSTEM, FENCE
    default: illegal_instr = 1'b1;
  endcase

  if (illegal_instr || ex_i.valid) begin  // propagate any fetch exception
    instruction_o.ex.valid = 1'b1;
    instruction_o.ex.cause = illegal_instr ? riscv::ILLEGAL_INSTR : ex_i.cause;
    instruction_o.ex.tval  = illegal_instr ? instr_i : ex_i.tval;
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "The result field is reused: pre-execution it holds the immediate; post-execution it holds the computed result. The scoreboard entry travels through the entire pipeline with this field transitioning from 'immediate' to 'result'.",
      "Illegal instruction detection is exhaustive: any unrecognized bit pattern sets illegal_instr=1, which becomes an exception carried in scoreboard_entry_t.ex. The pipeline treats it like any other exception.",
      "CSR instructions check privilege level and trap bits (tvm_i, tw_i, tsr_i) at decode time. A SFENCE.VMA in U-mode or with tvm=1 generates a ILLEGAL_INSTR exception here, not in the CSR file."
    ]
  },

  // ── ISSUE STAGE ───────────────────────────────────────────────────────────
  {
    module: "issue_stage",
    path: "core/issue_stage.sv",
    overview: "Issue stage: reads register file operands, checks RAW hazards via scoreboard, handles forwarding from writeback buses, and dispatches fu_data_t to functional units when all operands are ready.",
    internalLogic: `issue_stage.sv wraps the scoreboard and the register file read logic (issue_read_operands.sv).

OPERAND RESOLUTION (in issue_read_operands.sv):
For each instruction at the scoreboard head ready to dispatch:
  1. Read rs1 from register file: rdata_a = regfile[rs1]
  2. Read rs2 from register file: rdata_b = regfile[rs2]
  3. Check scoreboard for forwarding:
     - Scan all valid scoreboard entries with result_valid=1 that match rs1/rs2
     - If match found: use scoreboard result (forward from in-flight result)
     - Also check all NrWbPorts writeback buses this cycle (fastest forward path)
  4. Check alu_result_ex_id_i: the ALU's combinational output (0-latency forward from EX)

DISPATCH CONDITIONS (all must be true):
  - instruction is at scoreboard issue pointer
  - all source operands are available (no pending RAW)
  - target functional unit is ready (fu_ready)
  - no structural hazard (e.g., only 1 LSU, only 1 BU)

STALL ON:
  - Scoreboard full (all slots occupied)
  - Source register has pending write in an issued-but-incomplete scoreboard entry
  - Target FU busy (mult_ready=0 during division, lsu_ready=0 when load buffer full)
  - CSR instruction: serialized (all in-flight must commit before CSR issues)`,
    alwaysBlocks: [
      {
        label: "always_comb : operand forwarding check",
        type: "comb",
        purpose: "Resolves source operand values by checking scoreboard, writeback buses, and ALU direct path",
        code: `// Simplified forwarding logic from issue_read_operands.sv
always_comb begin : operand_fwd
  operand_a = regfile_rdata_a;  // default: register file
  operand_b = regfile_rdata_b;

  // Check all NrWbPorts writeback buses (results arriving THIS cycle)
  for (int i = 0; i < NrWbPorts; i++) begin
    if (wbdata_valid_i[i]) begin
      if (wbdata_trans_id_i[i] == issue_instr.rs1_trans_id)
        operand_a = wbdata_i[i];  // forward from writeback bus
      if (wbdata_trans_id_i[i] == issue_instr.rs2_trans_id)
        operand_b = wbdata_i[i];
    end
  end

  // ALU direct path: ALU result available THIS cycle (0-latency)
  for (int i = 0; i < NrIssuePorts; i++) begin
    if (alu_result_valid_i[i] && scoreboard_match_rs1)
      operand_a = alu_result_ex_id_i[i];
    if (alu_result_valid_i[i] && scoreboard_match_rs2)
      operand_b = alu_result_ex_id_i[i];
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "The forwarding network scans ALL writeback buses every cycle. With NrWbPorts=4 (ALU×2 + LSU + MUL), this is 4 comparators per source register per cycle — 8 total. All run in parallel.",
      "alu_result_ex_id_i is the fastest forward: ALU result is available combinationally in the same cycle it completes. This enables back-to-back ALU instruction throughput of 1/cycle with no stalls.",
      "CSR serialization: when a CSR instruction is at the head of decode, issue_stage deasserts its ready until the scoreboard is completely empty (all entries committed). This prevents any in-flight instruction from seeing a partially-updated CSR state."
    ]
  },

  // ── SCOREBOARD ────────────────────────────────────────────────────────────
  {
    module: "scoreboard",
    path: "core/scoreboard.sv",
    overview: "Out-of-order instruction tracking table. Circular FIFO of sb_mem_t entries. Tracks: issued (dispatched to FU), cancelled (on wrong path), and result validity. trans_id = slot index enables O(1) writeback routing.",
    internalLogic: `THE sb_mem_t STRUCT (actual typedef from scoreboard.sv):
  typedef struct packed {
    logic issued;     // dispatched to a functional unit
    logic cancelled;  // on mispredicted branch path, to be dropped
    scoreboard_entry_t sbe; // the instruction (sbe.valid = result computed)
  } sb_mem_t;

CIRCULAR BUFFER POINTERS:
  issue_cnt_q:    next slot for new instructions from decode (tail)
  commit_pointer: oldest instruction to present to commit (head)

ALLOCATION (from decode):
  When decoded_instr_valid_i[i] && decoded_instr_ack_o[i]:
    mem[issue_cnt].sbe = decoded_instr_i[i]
    mem[issue_cnt].sbe.trans_id = issue_cnt  ← SLOT INDEX IS THE TRANS_ID
    mem[issue_cnt].sbe.valid = 0   (result not yet computed)
    mem[issue_cnt].issued = 0      (not yet dispatched)
    issue_cnt++

WRITEBACK (from functional units):
  NrWbPorts buses, each carries: trans_id + result + exception + valid
  For each valid writeback: mem[trans_id].sbe.result = result; mem[trans_id].sbe.valid = 1
  O(1) — no search, direct index

DISPATCH (to functional units):
  An entry at issue_instr_o is ready when:
    mem[issue_ptr].sbe.valid = 0 (not yet completed — it's queued, not done)
    AND no RAW dependency on any issued-but-incomplete entry
  When issue_ack_i: mem[issue_ptr].issued = 1; advance issue_ptr

BRANCH MISPREDICTION SQUASH:
  resolved_branch_i.is_mispredict: mark all entries after the branch as cancelled=1
  commit_stage receives commit_drop_o and frees them without writing registers

FULL/EMPTY:
  sb_full_o = (issue_cnt - commit_pointer) == NR_SB_ENTRIES
  Empty: issue_cnt == commit_pointer`,
    alwaysBlocks: [
      {
        label: "always_ff : scoreboard array (allocation + writeback)",
        type: "seq",
        purpose: "Manages the sb_mem_t array: allocates new entries and updates with writeback results",
        code: `always_ff @(posedge clk_i or negedge rst_ni) begin
  if (!rst_ni || flush_i) begin
    for (int i = 0; i < NR_SB_ENTRIES; i++)
      mem_q[i] <= '{issued: 0, cancelled: 0, sbe: '0};
    issue_cnt_q      <= '0;
    commit_pointer_q <= '0;
  end else begin
    // ── ALLOCATION from decode ──────────────────────────────────────────
    for (int i = 0; i < NrIssuePorts; i++) begin
      if (decoded_instr_valid_i[i] && decoded_instr_ack_o[i]) begin
        mem_q[issue_cnt_q + i].sbe          <= decoded_instr_i[i];
        mem_q[issue_cnt_q + i].sbe.trans_id <= issue_cnt_q + i; // slot IS the ID
        mem_q[issue_cnt_q + i].sbe.valid    <= 1'b0;
        mem_q[issue_cnt_q + i].issued       <= 1'b0;
        mem_q[issue_cnt_q + i].cancelled    <= 1'b0;
      end
    end
    // ── WRITEBACK from functional units ──────────────────────────────────
    for (int i = 0; i < NrWbPorts; i++) begin
      if (wt_valid_i[i]) begin
        mem_q[trans_id_i[i]].sbe.result <= wbdata_i[i];
        mem_q[trans_id_i[i]].sbe.valid  <= 1'b1;
        if (ex_i[i].valid)
          mem_q[trans_id_i[i]].sbe.ex   <= ex_i[i];
      end
    end
    // ── COMMIT pointer advance ────────────────────────────────────────────
    if (commit_ack_i[0]) commit_pointer_q <= commit_pointer_q + 1;
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "trans_id = slot index: the scoreboard slot number IS the transaction ID. No lookup needed on writeback — direct array index. This is why scoreboard depth (NR_SB_ENTRIES=8–16) limits simultaneous in-flight instructions.",
      "cancelled bit: instructions on a mispredicted path complete execution (their results are computed) but are marked cancelled. commit_stage sees commit_drop_o=1 and frees the slot without writing registers.",
      "CVA6 does NOT rename registers (unlike full OoO machines). RAW dependency check scans the scoreboard for any entry with matching rd that hasn't yet written back. This is O(NR_SB_ENTRIES) comparators but simple to implement."
    ]
  },

  // ── EX_STAGE ─────────────────────────────────────────────────────────────
  {
    module: "ex_stage",
    path: "core/ex_stage.sv",
    overview: "Execute stage orchestrator. Instantiates all functional units (ALU×NrIssuePorts, BU, LSU, MULT, FPU) and routes fu_data_t to the correct unit. Collects writeback results on NrWbPorts buses back to the scoreboard.",
    internalLogic: `ex_stage.sv is pure instantiation and routing — no logic of its own.

FUNCTIONAL UNIT DISPATCH:
Each FU has its own valid/ready interface:
  alu_valid_i[NrIssuePorts] → ALU[NrIssuePorts], alu_ready_o
  branch_valid_i            → branch_unit, (always ready, 1-cycle)
  lsu_valid_i               → load_store_unit, lsu_ready_o
  mult_valid_i              → mult, mult_ready_o (0 when dividing)
  csr_valid_i               → handled in commit_stage actually

ALU DIRECT FORWARDING:
alu_result_ex_id_o[NrIssuePorts] — ALU result goes DIRECTLY back to issue_stage.
This is the critical 0-latency forwarding path:
  Cycle N:   ALU computes result for instruction A
  Cycle N:   alu_result_ex_id_o = result  (same cycle, combinational)
  Cycle N+1: instruction B (reading rs1=A.rd) gets forwarded value without scoreboard lookup

WRITEBACK BUS ASSIGNMENT:
  wbdata port 0: ALU[0] result
  wbdata port 1: ALU[1] result (if NrIssuePorts=2)
  wbdata port 2: LSU load result
  wbdata port 3: MULT result
  wbdata port 4: FPU result
All NrWbPorts buses broadcast simultaneously to the scoreboard.`,
    alwaysBlocks: [],
    stateMachines: [],
    keyDesignPoints: [
      "3 D-cache ports (load/store/AMO): separate ports prevent head-of-line blocking. A store waiting in the store buffer doesn't block a load ready to execute.",
      "flush_i kills all FU state. ALU is combinational — nothing to kill. BU output is simply not asserted. LSU asserts kill_req to the D-cache. MUL/DIV FSM resets to IDLE.",
      "alu_result_ex_id_o is a 0-cycle forwarding path — combinational output of the ALU directly connected to the issue stage operand mux. This is what enables 1-cycle ALU→ALU throughput."
    ]
  },

  // ── ALU ───────────────────────────────────────────────────────────────────
  {
    module: "alu",
    path: "core/alu.sv",
    overview: "Fully combinational integer ALU. Implements ADD/SUB (carry-save adder), AND/OR/XOR, shifts, comparisons, and B-extension operations (CLZ/CTZ/CPOP/bitmanip). Outputs branch comparison result to branch_unit.",
    internalLogic: `THE ADDER (core of most ALU operations):
Uses a carry-save trick: A + B uses {A, carry_in=1} + {B XOR negate_mask}
For subtraction: negate_mask = all-ones, carry_in=1 → effectively A + ~B + 1 = A - B
This avoids a separate subtractor — one adder handles both ADD and SUB.

adder_op_b_negate = (operation inside {EQ, NE, SUB, SUBW, ANDN, ORN, XNOR})
adder_in_a = {operand_a, 1'b1}           (carry-in bit appended)
adder_in_b = {operand_b, 1'b0} XOR {(XLEN+1){negate_mask}}
adder_result = adder_result_ext[XLEN:1]
adder_z_flag = ~|adder_result           (zero flag: 1 when result = 0)

BRANCH COMPARE OUTPUT:
alu_branch_res_o feeds directly to branch_unit.sv (not through scoreboard).
  EQ:  alu_branch_res_o = adder_z_flag  (A==B → A-B=0)
  NE:  alu_branch_res_o = ~adder_z_flag
  LTS: signed less-than using sign bit comparison with borrow
  LTU: unsigned less-than from carry bit

SHIFT LOGIC:
SLL: operand_a << shift_amt  (left shift, fills zeros)
SRL: operand_a >> shift_amt  (logical right, fills zeros)
SRA: $signed(operand_a) >>> shift_amt  (arithmetic right, fills sign bit)

B-EXTENSION (RVB, if configured):
CLZ/CTZ: leading/trailing zero count → instantiates lzc from common_cells
CPOP: population count (count set bits)
REV8: byte-reverse
BEXT/BSET/BINV: bit extract/set/invert
CLMUL: carry-less multiply (for cryptographic hash functions)`,
    alwaysBlocks: [
      {
        label: "always_comb : result_mux (final output selection)",
        type: "comb",
        purpose: "Selects the final ALU result from adder, logic, shift, or B-extension outputs",
        code: `// From core/alu.sv — result mux (simplified)
always_comb begin : result_mux
  unique case (fu_data_i.operation)
    // Adder results
    ADD, SUB, ADDW, SUBW,
    ANDN, ORN, XNOR:    result_o = adder_result;
    // Logic
    ANDL:               result_o = operand_a & operand_b;
    ORL:                result_o = operand_a | operand_b;
    XORL:               result_o = operand_a ^ operand_b;
    // Shifts
    SLL, SLLW:          result_o = operand_a << shift_amt;
    SRL, SRLW:          result_o = operand_a >> shift_amt;
    SRA, SRAW:          result_o = $signed(operand_a) >>> shift_amt;
    // Set less-than
    SLTS, SLTU:         result_o = {63'b0, less};
    // LUI: upper immediate (rs1=0, operand_b=immediate)
    // AUIPC handled by use_pc flag in decoder
    // B-extension (if RVB configured)
    CLZ:  result_o = lz_tz_count;
    CPOP: result_o = cpop;
    REV8: result_o = rev8_result;
    default: result_o = adder_result;
  endcase
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "Fully combinational — no pipeline registers. Result is valid the same cycle operands arrive. This is a deliberate design choice: simpler forwarding at the cost of longer critical path through the ALU.",
      "Carry-save adder for both ADD and SUB: negate operand_b (XOR all-ones) and add 1 via carry-in to get two's complement subtraction. One adder, two operations.",
      "alu_branch_res_o is separate from result_o. The branch_unit.sv needs the comparison result independently to determine taken/not-taken and check against the prediction."
    ]
  },

  // ── BRANCH UNIT ───────────────────────────────────────────────────────────
  {
    module: "branch_unit",
    path: "core/branch_unit.sv",
    overview: "Resolves branches and jumps. Computes actual target (jump_base + imm), uses ALU comparison result to determine taken/not-taken, compares against frontend prediction, and outputs bp_resolve_t. One cycle, combinational.",
    internalLogic: `JUMP BASE SELECTION:
  JALR: jump_base = operand_a (rs1 register value — indirect jump)
  All others (branches, JAL): jump_base = pc_i (PC-relative)

TARGET COMPUTATION:
  target_address = $signed(jump_base) + $signed(fu_data_i.imm)
  Special: JALR forces target_address[0] = 0 (RISC-V spec, ensures 2-byte alignment)

TAKEN DETERMINATION:
  Unconditional (JAL, JALR): always taken
  Conditional branches: branch_comp_res_i (from ALU, result of comparison)

BRANCH RESULT (return address):
  branch_result_o = next_pc = pc + (is_compressed ? 2 : 4)
  Written to rd for JAL/JALR — this is the link register value

MISPREDICTION DETECTION:
  resolved_branch_o.target_address = taken ? target_address : next_pc
  is_mispredict = (actual_next_pc != branch_predict_i.predict_address)
  Cases:
    Frontend predicted not-taken but branch IS taken → mispredict
    Frontend predicted taken but branch is NOT taken → mispredict
    Frontend predicted wrong target → mispredict`,
    alwaysBlocks: [
      {
        label: "always_comb : mispredict_handler (actual CVA6 source)",
        type: "comb",
        purpose: "Computes actual branch outcome and target; detects misprediction vs frontend prediction",
        code: `always_comb begin : mispredict_handler
  automatic logic [VLEN-1:0] jump_base;
  jump_base = (fu_data_i.operation == JALR) ? fu_data_i.operand_a : pc_i;

  resolved_branch_o.valid       = branch_valid_i;
  resolved_branch_o.is_mispredict = 1'b0;
  resolved_branch_o.pc           = pc_i;
  resolved_branch_o.cf_type      = branch_predict_i.cf;

  next_pc        = pc_i + (is_compressed_instr_i ? 'd2 : 'd4);
  target_address = $unsigned($signed(jump_base) + $signed(fu_data_i.imm));
  if (fu_data_i.operation == JALR) target_address[0] = 1'b0; // force alignment

  branch_result_o = next_pc; // return address for JAL/JALR

  if (branch_valid_i) begin
    resolve_branch_o = 1'b1;
    resolved_branch_o.target_address = branch_comp_res_i ? target_address : next_pc;
    resolved_branch_o.is_taken       = branch_comp_res_i;
    // Misprediction: frontend expected different next PC
    resolved_branch_o.is_mispredict =
      (branch_predict_i.cf == NoCF) ? branch_comp_res_i  // predicted no branch but taken
      : branch_comp_res_i
        ? (branch_predict_i.predict_address != target_address)  // taken, wrong target
        : (branch_predict_i.cf != NoCF);                        // not-taken, predicted taken
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "branch_comp_res_i comes from the ALU — branch_unit does NOT recompute the comparison. Clean separation: ALU does arithmetic, branch_unit does flow control.",
      "resolve_branch_o (separate from is_mispredict) signals the scoreboard that a branch instruction has resolved — allowing any issue-stall waiting for branch resolution to be released.",
      "Misaligned target exception: if a branch target is not 2-byte-aligned (bit 1 set with no C extension), branch_exception_o.valid=1 is set. This exception flows through the pipeline and is handled at commit."
    ]
  },

  // ── LOAD_STORE_UNIT ───────────────────────────────────────────────────────
  {
    module: "load_store_unit",
    path: "core/load_store_unit.sv",
    overview: "LSU top: instantiates MMU, load_unit, store_unit, amo_buffer. Routes load/store fu_data_t to the appropriate sub-unit, manages the 3 D-cache ports, and exposes separate load/store writeback buses to the scoreboard.",
    internalLogic: `ROUTING LOGIC:
  is_store = fu_data_i.operation inside {SB, SH, SW, SD, ...}
  is_amo   = is_amo(fu_data_i.operation)
  is_load  = !is_store && !is_amo

VIRTUAL ADDRESS (AGU — Address Generation Unit):
  vaddr = operand_a + sign_extend(imm)  (computed immediately on dispatch)
  This is the VIRTUAL address — TLB translation produces paddr

THREE D-CACHE PORTS:
  Port 0 → load_unit  (reads)
  Port 1 → store_unit (writes, only on commit drain)
  Port 2 → amo_buffer (atomic operations)

WRITEBACK BUSES:
  load_valid_o + load_result_o + load_trans_id_o  → scoreboard wb bus 2
  store_valid_o + store_result_o + store_trans_id_o → scoreboard wb bus 3
  (store result is always 0 — stores have no destination register value)

FORWARDING INTERFACE:
  store_unit exposes: store_buffer_valid_o, store_buffer_paddr_o, store_buffer_data_o, store_buffer_be_o
  load_unit checks these for address matches before going to cache`,
    alwaysBlocks: [],
    stateMachines: [],
    keyDesignPoints: [
      "The LSU has no logic itself — it is a pure structural wrapper. All real logic is in load_unit, store_unit, amo_buffer, and mmu.",
      "resolved_branch_i feeds into load_unit to kill speculative loads on the wrong branch path. Loads that have completed but are marked as cancelled are discarded.",
      "no_st_pending_o is the store buffer empty signal. The commit stage needs this for FENCE instructions: must wait until all stores have drained to cache before the fence can commit."
    ]
  },

  // ── MMU ────────────────────────────────────────────────────────────────────
  {
    module: "mmu",
    path: "core/mmu.sv",
    overview: "Memory Management Unit. Instantiates ITLB, DTLB, and the Page Table Walker. Translates virtual→physical addresses for fetch and load/store. On TLB miss, activates the PTW to walk the Sv39 page table.",
    internalLogic: `TWO TLB INSTANCES:
  ITLB (Instruction TLB): used by the frontend for instruction fetch address translation
  DTLB (Data TLB): used by load_unit and store_unit

TLB LOOKUP PROTOCOL:
  Every cycle: present vaddr + ASID + access_type to TLB
  TLB returns: lu_hit_o (1 if hit), lu_content_o (PTE with paddr + permissions)
  Latency: 1 cycle (combinational lookup, result available next cycle)

TLB MISS HANDLING:
  dtlb_miss_o or itlb_miss_o → activate PTW (ptw_active_o=1)
  PTW walks the page table in memory (via D-cache reads)
  PTW returns: pte_o (the leaf PTE), itlb_update_o / dtlb_update_o (fill the TLB)
  After fill: TLB can serve the original request on next cycle

PERMISSION CHECKING (in mmu.sv, after TLB hit):
  U-mode: PTE.U must be set (or mstatus.SUM for S-mode accessing U-mode pages)
  Load: PTE.R must be set (or PTE.X with mstatus.MXR)
  Store: PTE.W must be set
  Fetch: PTE.X must be set
  Permission violation → lsu_exception_o.valid=1 with LOAD/STORE/INSTR_PAGE_FAULT cause

SATP REGISTER:
  satp_ppn_i: the physical page number of the root page table (from CSR file)
  When satp.MODE=0 (Bare): translation disabled, vaddr = paddr
  When satp.MODE=8 (Sv39): 3-level page table walk`,
    alwaysBlocks: [
      {
        label: "always_comb : mmu permission check (post TLB hit)",
        type: "comb",
        purpose: "Checks PTE permission bits against the access type and privilege level",
        code: `// Post TLB-hit permission check (simplified from mmu.sv)
always_comb begin : permission_check
  lsu_exception_o = '0;

  if (dtlb_hit && lsu_req) begin
    automatic riscv::pte_sv39_t pte = dtlb_content;

    // U-bit check: U-mode cannot access S/M-mode pages (unless SUM bit set)
    if (priv_lvl == PRIV_LVL_U && !pte.u)
      lsu_exception_o = '{valid:1, cause:riscv::LOAD_PAGE_FAULT, tval:lsu_vaddr};
    else if (priv_lvl == PRIV_LVL_S && pte.u && !mstatus.sum)
      lsu_exception_o = '{valid:1, cause:riscv::LOAD_PAGE_FAULT, tval:lsu_vaddr};

    // Write permission check
    else if (lsu_is_store && !pte.w)
      lsu_exception_o = '{valid:1, cause:riscv::STORE_PAGE_FAULT, tval:lsu_vaddr};

    // Read permission check (MXR: execute-only pages readable when mstatus.mxr=1)
    else if (!lsu_is_store && !pte.r && !(pte.x && mstatus.mxr))
      lsu_exception_o = '{valid:1, cause:riscv::LOAD_PAGE_FAULT, tval:lsu_vaddr};
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "Two separate TLBs (ITLB and DTLB) allow simultaneous instruction fetch translation and data access translation — critical for performance.",
      "When translation is disabled (satp.MODE=0), the MMU passes vaddr straight through as paddr with no TLB lookup. This is the 'Bare' mode used in machine-mode before the OS sets up page tables.",
      "The PTW uses the D-cache to read PTEs. This means a page table walk competes for D-cache bandwidth with normal loads/stores, but also benefits from D-cache caching of frequently-used PTE entries."
    ]
  },

  // ── TLB ────────────────────────────────────────────────────────────────────
  {
    module: "tlb",
    path: "core/tlb.sv",
    overview: "Fully-associative TLB (4 entries ITLB, 16 entries DTLB). Each entry stores VPN, ASID, PPN, permission bits, and page size. Lookup is a parallel tag compare across all entries in 1 cycle.",
    internalLogic: `TLB ENTRY STRUCTURE:
  typedef struct packed {
    logic [VPN_BITS-1:0]  vpn;        // Virtual Page Number (27 bits for Sv39)
    logic [ASID_BITS-1:0] asid;       // Address Space ID (process identifier)
    logic [PPN_BITS-1:0]  ppn;        // Physical Page Number
    logic                 is_page_1G; // 1GB superpage
    logic                 is_page_2M; // 2MB superpage
    logic [3:0]           priv_lvl;   // privilege level that created this entry
    logic                 d, a, g, u; // dirty, accessed, global, user PTE bits
    logic                 x, w, r;    // execute, write, read permissions
    logic                 valid;      // entry is populated
  } tlb_entry_t;

LOOKUP (combinational, all entries in parallel):
  For each TLB entry i:
    vpn_match   = (vpn_i[VPN_BITS-1:12] == entry[i].vpn) OR superpage match
    asid_match  = (asid_i == entry[i].asid) OR entry[i].global
    lu_hit_o[i] = vpn_match && asid_match && entry[i].valid

SUPERPAGE HANDLING:
  For 1GB pages: only VPN[2] (bits [38:30]) is compared; VPN[1:0] come from the original virtual address
  For 2MB pages: VPN[2:1] compared; VPN[0] from virtual address
  This allows one TLB entry to map a large range

TLB FILL (from PTW on miss):
  update_i.valid triggers writing the new entry into a free slot
  Replacement policy: LRU or random (implementation-dependent)

FLUSH:
  flush_i=1 clears all entries with matching ASID (on context switch)
  flush_i=1 + flush_all=1 clears all entries (on satp write)`,
    alwaysBlocks: [
      {
        label: "always_comb : tlb_lookup (parallel tag compare)",
        type: "comb",
        purpose: "Checks all TLB entries simultaneously against the incoming virtual address and ASID",
        code: `// Fully-associative TLB lookup — all entries checked in parallel
always_comb begin : tlb_lookup
  lu_hit_o    = '0;
  lu_content_o = '0;

  for (int i = 0; i < TLB_ENTRIES; i++) begin
    if (content_q[i].valid) begin
      // Check VPN match (respecting superpage granularity)
      logic vpn_match;
      if (content_q[i].is_page_1G)
        vpn_match = (vpn_i[26:18] == content_q[i].vpn[26:18]); // 1GB: match VPN[2] only
      else if (content_q[i].is_page_2M)
        vpn_match = (vpn_i[26:9]  == content_q[i].vpn[26:9]);  // 2MB: match VPN[2:1]
      else
        vpn_match = (vpn_i        == content_q[i].vpn);         // 4KB: full VPN match

      // Check ASID match (or global mapping — applies to all processes)
      logic asid_match = (asid_i == content_q[i].asid) || content_q[i].g;

      if (vpn_match && asid_match) begin
        lu_hit_o     = 1'b1;
        lu_content_o = content_q[i]; // return PTE fields
      end
    end
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "Fully-associative with only 4/16 entries: fully-associative gives the best hit rate for a small table (no conflict misses), but doesn't scale to large tables. TLBs are small by design — the hit rate is still excellent because page table locality is high.",
      "ASID (Address Space ID): allows multiple processes to coexist in the TLB without flushing on context switches. Each process gets a unique ASID. Global mappings (kernel pages) use the G bit and match any ASID.",
      "Superpage support reduces TLB pressure: a single 1GB TLB entry covers 1GB of virtual address space. Without superpages, mapping 1GB would require 256K 4KB TLB entries."
    ]
  },

  // ── COMMIT STAGE ─────────────────────────────────────────────────────────
  {
    module: "commit_stage",
    path: "core/commit_stage.sv",
    overview: "The ONLY module that writes architectural state. Evaluates scoreboard head entries, handles exceptions (outputs exception_o), writes register file (we_gpr_o), drains stores to cache (commit_lsu_o), and handles CSR/fence/debug instructions.",
    internalLogic: `COMMIT DECISION TREE (per port, in priority order):
  1. halt_i=1 → don't commit anything (WFI/debug)
  2. !commit_instr_i[0].valid → stall (result not yet computed)
  3. commit_drop_i[0]=1 → discard without writing (squashed instruction)
  4. commit_instr_i[0].ex.valid → exception: output exception_o, don't write
  5. else: commit based on fu type:
     ALU/MULT/LOAD: we_gpr_o=1, write result to register file
     STORE: commit_lsu_o=1 (drain oldest store buffer entry)
     CSR: commit_csr_o=1, set csr_op_o and csr_wdata_o
     FPU: we_fpr_o=1, dirty_fp_state_o=1
     FENCE: fence_o=1 or fence_i_o=1
     SFENCE.VMA: sfence_vma_o=1

TWO-PORT COMMIT (NrCommitPorts=2):
  Both ports checked simultaneously. Port 1 commits only if:
    - Port 0 also committed (instructions commit in order)
    - Port 1 instruction has valid result
    - No exception on port 0 or port 1
    - Port 0 is not a store that needs LSU drain (serialization)

EXCEPTION OUTPUT:
  exception_o is asserted combinationally when:
    commit_instr_i[0].valid && commit_instr_i[0].ex.valid && !commit_drop_i[0]
  The CSR file receives this and executes the trap sequence.

PC OUTPUT:
  pc_o = commit_instr_i[0].pc → CSR file uses this to set mepc/sepc on trap`,
    alwaysBlocks: [
      {
        label: "always_comb : commit (main commit logic, actual CVA6 source)",
        type: "comb",
        purpose: "Evaluates head scoreboard entry and generates register write, store drain, CSR, and exception signals",
        code: `// From core/commit_stage.sv — always_comb : commit
always_comb begin : commit
  // Defaults
  commit_ack_o = '0; we_gpr_o = '0; we_fpr_o = '0;
  commit_lsu_o = 1'b0; commit_csr_o = 1'b0;
  wdata_o[0]   = commit_instr_i[0].result;
  fence_i_o = 1'b0; fence_o = 1'b0; sfence_vma_o = 1'b0;
  exception_o  = '0; flush_commit_o = 1'b0;

  if (commit_instr_i[0].valid && !halt_i) begin
    if (commit_instr_i[0].ex.valid || break_from_trigger_i) begin
      // EXCEPTION PATH
      if (commit_drop_i[0]) commit_ack_o[0] = 1'b1; // free squashed entry
      // exception_o driven separately (see below)
    end else begin
      // CLEAN COMMIT PATH
      commit_ack_o[0] = 1'b1;
      unique case (commit_instr_i[0].fu)
        ALU, MULT: we_gpr_o[0] = (commit_instr_i[0].rd != 5'b0);
        LOAD:      we_gpr_o[0] = (commit_instr_i[0].rd != 5'b0);
        STORE: begin
          commit_lsu_o = !flush_dcache_i;
          if (!commit_lsu_ready_i) commit_ack_o[0] = 1'b0; // stall if LSU not ready
        end
        CSR: begin
          commit_csr_o = 1'b1; csr_op_o = commit_instr_i[0].op;
          csr_wdata_o  = commit_instr_i[0].result;
          we_gpr_o[0]  = (commit_instr_i[0].rd != 5'b0);
          if (commit_instr_i[0].op == FENCE_I)   fence_i_o    = 1'b1;
          if (commit_instr_i[0].op == FENCE)      fence_o      = 1'b1;
          if (commit_instr_i[0].op == SFENCE_VMA) sfence_vma_o = 1'b1;
        end
        FPU: begin we_fpr_o[0] = 1'b1; end
      endcase
    end
  end

  // Exception output (combinational, separate from ack logic)
  exception_o.valid = commit_instr_i[0].valid && commit_instr_i[0].ex.valid
                      && !commit_drop_i[0] && !halt_i;
  exception_o.cause = commit_instr_i[0].ex.cause;
  exception_o.tval  = commit_instr_i[0].ex.tval;
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "commit_drop_i handling: squashed instructions (cancelled=1 in scoreboard) may have completed execution. commit_drop_i=1 signals 'free this slot but don't write anything'. The instruction is discarded cleanly.",
      "Store commit stall: if commit_lsu_ready_i=0 (D-cache busy accepting the store), commit_ack_o=0 for the STORE instruction. The commit stage stalls until the store buffer drain is accepted.",
      "Two-port commit enables 2 instructions/cycle IPC at commit — but only when both head entries are clean (no exceptions, no serialization requirements). A single exception or CSR instruction forces single-issue commit."
    ]
  },

  // ── CSR_REGFILE ───────────────────────────────────────────────────────────
  {
    module: "csr_regfile",
    path: "core/csr_regfile.sv",
    overview: "RISC-V CSR register file implementing all M-mode and S-mode control registers. Handles trap sequences (save PC/cause/tval, switch privilege, output trap vector), MRET/SRET, interrupt control, and performance counters.",
    internalLogic: `ALL CSR REGISTERS IMPLEMENTED:
  M-mode: mstatus, misa, medeleg, mideleg, mie, mtvec, mscratch, mepc, mcause, mtval, mip
           mhartid, minstret, mcycle, mhpmcounterN (performance counters)
  S-mode: sstatus, sie, stvec, sscratch, sepc, scause, stval, sip, satp
  F-mode: fcsr (frm + fflags)
  Debug: dcsr, dpc, dscratch0/1

CSR READ (execute time):
  Address csr_addr_i → decode which CSR → combinational read → csr_rdata_o
  Used by id_stage to put the old CSR value into the instruction result for CSRRS/CSRRC

CSR WRITE (commit time):
  csr_op_i ∈ {ADD=NOP, CSRRW, CSRRS, CSRRC, CSRRWI, CSRRSI, CSRRCI}
  CSRRW: csr[addr] = wdata
  CSRRS: csr[addr] = csr[addr] | wdata  (set bits)
  CSRRC: csr[addr] = csr[addr] & ~wdata  (clear bits)

TRAP SEQUENCE (triggered by ex_i.valid from commit_stage):
  1. Determine trap destination: M-mode or S-mode (based on medeleg/mideleg)
  2. Save: mepc_n = pc_i; mcause_n = cause; mtval_n = tval
  3. Update mstatus: MPIE=MIE, MIE=0, MPP=current_priv_lvl
  4. Switch privilege: priv_lvl_n = PRIV_LVL_M (or S if delegated)
  5. Output: trap_vector_base_o = mtvec; flush_o=1 (pipeline restart)

MRET/SRET (triggered by csr_op_i = MRET/SRET at commit):
  1. Restore privilege: priv_lvl_n = mstatus.MPP
  2. Restore interrupts: mstatus.MIE = mstatus.MPIE; mstatus.MPIE = 1
  3. Output: epc_o = mepc_q; eret_o = 1 (frontend redirects to epc)

SIDE-EFFECT FLUSH:
  Writing satp (changes page tables) → flush_o=1 (must flush TLBs + pipeline)
  Writing mstatus (may affect permissions) → flush_o=1
  This triggers controller.sv to flush the appropriate stages`,
    alwaysBlocks: [
      {
        label: "always_comb : csr_write + trap_sequence",
        type: "comb",
        purpose: "Handles CSR writes at commit time and generates trap sequence outputs on exception",
        code: `// Simplified CSR write and trap handling (from csr_regfile.sv)
always_comb begin : csr_write_trap
  // Defaults: hold current values
  mepc_n = mepc_q; mcause_n = mcause_q; mstatus_n = mstatus_q;
  priv_lvl_n = priv_lvl_q; eret_o = 1'b0; flush_o = 1'b0;
  trap_vector_base_o = mtvec_q;

  // ── TRAP (exception from commit_stage) ───────────────────────────────
  if (ex_i.valid) begin
    if (trap_to_M_mode) begin
      mepc_n           = pc_i;            // save interrupted PC
      mcause_n         = ex_i.cause;      // exception cause code
      mtval_n          = ex_i.tval;       // fault address or instr
      mstatus_n.mpie   = mstatus_q.mie;  // save interrupt enable
      mstatus_n.mie    = 1'b0;           // disable interrupts in handler
      mstatus_n.mpp    = priv_lvl_q;     // save privilege level
      priv_lvl_n       = PRIV_LVL_M;    // switch to M-mode
      trap_vector_base_o = mtvec_q;
    end else begin // S-mode trap
      sepc_n = pc_i; scause_n = ex_i.cause; stval_n = ex_i.tval;
      mstatus_n.spie = mstatus_q.sie; mstatus_n.sie = 1'b0;
      mstatus_n.spp  = priv_lvl_q[0];
      priv_lvl_n     = PRIV_LVL_S;
      trap_vector_base_o = stvec_q;
    end
  end

  // ── MRET: return from exception ──────────────────────────────────────
  if (mret) begin
    priv_lvl_n      = mstatus_q.mpp;    // restore privilege
    mstatus_n.mie   = mstatus_q.mpie;  // restore interrupt enable
    mstatus_n.mpie  = 1'b1;
    mstatus_n.mpp   = PRIV_LVL_U;
    epc_o           = mepc_q;           // return to interrupted PC
    eret_o          = 1'b1;
  end

  // ── CSR WRITE (at commit) ─────────────────────────────────────────────
  if (csr_we) begin
    unique case (csr_addr_i)
      riscv::CSR_MSTATUS: begin
        mstatus_n = csr_wdata_i;
        flush_o   = 1'b1;  // mstatus change may affect permissions
      end
      riscv::CSR_SATP: begin
        satp_n  = csr_wdata_i;
        flush_o = 1'b1;    // page table base changed: flush TLBs
      end
      riscv::CSR_MEPC:   mepc_n   = csr_wdata_i;
      riscv::CSR_MTVEC:  mtvec_n  = csr_wdata_i;
      // ... all other CSRs
    endcase
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "CSR read at execute time, CSR write at commit time. This two-phase approach ensures: (1) the old value is captured for CSRRS rd, (2) writes only happen for committed instructions.",
      "flush_o on satp/mstatus write: these CSRs affect memory access permissions and page table structure. Any in-flight instruction that looked up the TLB with the old mapping could produce wrong results. The pipeline must flush and restart.",
      "minstret is incremented for every commit_ack_i — counting committed instructions, not executed ones. This is the architecturally correct definition. Speculative instructions that are cancelled don't increment minstret.",
      "Interrupt delegation (medeleg/mideleg): allows M-mode to hand specific exceptions/interrupts to S-mode handlers. When an exception is delegated, the trap uses sepc/scause/stval/stvec instead of the M-mode equivalents."
    ]
  },

  // ── BTB ───────────────────────────────────────────────────────────────────
  {
    module: "btb",
    path: "core/frontend/btb.sv",
    overview: "The Branch Target Buffer predicts where taken control-flow instructions will jump before decode runs. It is a tiny associative prediction structure in the frontend: given the current fetch PC, it returns a predicted target address and valid bit so the frontend can redirect fetch speculatively.",
    internalLogic: `The BTB is part of CVA6's fetch-side branch prediction path. Its job is different from the BHT: the BHT predicts WHETHER a branch is taken, while the BTB predicts WHERE to go if it is taken.

At a high level, the BTB stores a small set of entries keyed by branch PC. Each entry contains at least:
  - branch PC tag / index information
  - predicted target address
  - valid bit

FETCH-TIME BEHAVIOR:
  1. frontend presents current virtual PC to the BTB
  2. BTB compares the PC against its stored entries
  3. on hit, returns a predicted target address and hit/valid indication
  4. frontend combines BTB output with BHT direction prediction to decide next PC

UPDATE BEHAVIOR:
When a branch or jump resolves in execute, branch_unit sends an update record back to the frontend. If the instruction was taken or mispredicted, the BTB may allocate/update the entry so future fetches know the real destination.

WHY A SEPARATE BTB?
A direction predictor alone is not enough. If you know a branch is likely taken but do not know the target until decode/execute computes it, you still lose cycles. The BTB gives the frontend a speculative target early enough to keep the fetch stream flowing.

CAPACITY TRADEOFF:
The BTB is intentionally small. That keeps lookup fast enough for the frontend critical path but means aliasing and eviction are normal. Wrong-target predictions are corrected by branch_unit/controller later via the mispredict flush path.`,
    alwaysBlocks: [
      {
        label: "always_comb : lookup / prediction readout",
        type: "comb",
        purpose: "Compares the fetch PC against BTB entries and returns predicted target information to the frontend.",
        code: `always_comb begin : btb_lookup
  btb_prediction_o.valid  = 1'b0;
  btb_prediction_o.target = '0;

  for (int i = 0; i < NR_ENTRIES; i++) begin
    if (entry_valid_q[i] && entry_pc_q[i] == vpc_i) begin
      btb_prediction_o.valid  = 1'b1;
      btb_prediction_o.target = entry_target_q[i];
    end
  end
end`
      },
      {
        label: "always_ff : entry update / allocate",
        type: "seq",
        purpose: "Writes a resolved branch target into the BTB so future fetches can speculatively jump to it.",
        code: `always_ff @(posedge clk_i or negedge rst_ni) begin
  if (!rst_ni) begin
    entry_valid_q <= '0;
  end else if (btb_update_i.valid) begin
    entry_valid_q[update_index]  <= 1'b1;
    entry_pc_q[update_index]     <= btb_update_i.pc;
    entry_target_q[update_index] <= btb_update_i.target_address;
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "BTB and BHT solve different problems: BTB predicts the target address; BHT predicts taken/not-taken. The frontend usually needs both for a useful speculative redirect.",
      "A BTB miss does not mean the design is wrong — it just means fetch falls back to the sequential PC path until decode/execute resolve the instruction.",
      "Because the BTB sits on the fetch path, it is designed to be very small and fast rather than perfectly accurate or fully associative at large scale.",
      "Wrong-target predictions are recovered by the normal branch misprediction machinery: branch_unit detects the mismatch and controller flushes younger instructions." 
    ]
  },

  // ── ALU_WRAPPER ───────────────────────────────────────────────────────────
  {
    module: "alu_wrapper",
    path: "core/alu_wrapper.sv",
    overview: "alu_wrapper is a thin handshake shell around the combinational ALU. It converts the raw combinational datapath into a valid/ready style execution unit that issue_stage/ex_stage can schedule cleanly.",
    internalLogic: `The core ALU itself is combinational: given operands and opcode, it produces a result immediately. Real execution pipelines still need control around that datapath:
  - when an instruction is accepted
  - when the result is considered valid
  - how trans_id/result metadata are held
  - how backpressure is expressed

alu_wrapper provides that control shell.

TYPICAL FLOW:
  1. issue/ex_stage asserts valid_i with fu_data_i + trans_id
  2. if wrapper is ready, it latches metadata and/or ALU output
  3. one cycle later it asserts valid_o with the tagged result
  4. downstream writeback logic consumes it

WHY WRAP A COMBINATIONAL ALU?
If you expose the bare combinational ALU directly everywhere, you push timing/control complexity into the surrounding pipeline. The wrapper isolates that complexity and gives the scheduler a standard interface similar to the other functional units.

This is especially useful in a wider-issue design because the surrounding logic wants a common contract: ready means you may dispatch, valid means a writeback result exists, and trans_id keeps scoreboard bookkeeping aligned with the result.`,
    alwaysBlocks: [
      {
        label: "always_comb : ready / accept logic",
        type: "comb",
        purpose: "Determines when the wrapper can accept a new ALU operation from the issue pipeline.",
        code: `always_comb begin : alu_wrapper_ctrl
  ready_o = !result_valid_q || result_ready_i;
  accept  = valid_i && ready_o;
end`
      },
      {
        label: "always_ff : pipeline register",
        type: "seq",
        purpose: "Registers ALU output and transaction metadata so the result is presented with a clean valid pulse.",
        code: `always_ff @(posedge clk_i or negedge rst_ni) begin
  if (!rst_ni) begin
    result_valid_q <= 1'b0;
  end else begin
    if (accept) begin
      result_q       <= alu_result;
      trans_id_q     <= trans_id_i;
      result_valid_q <= 1'b1;
    end else if (result_ready_i) begin
      result_valid_q <= 1'b0;
    end
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "alu_wrapper does not change ALU math; it standardizes timing and handshake behavior around the ALU.",
      "The wrapper is effectively a one-stage pipeline register, improving integration and often easing timing closure.",
      "trans_id must travel with the result so scoreboard writeback marks the correct in-flight instruction complete.",
      "If backpressure exists downstream, the wrapper holds the computed result stable until it is accepted." 
    ]
  },

  // ── AMO_BUFFER ────────────────────────────────────────────────────────────
  {
    module: "amo_buffer",
    path: "core/amo_buffer.sv",
    overview: "amo_buffer serializes atomic memory operations. It holds the decoded AMO request and its metadata until the instruction reaches commit, ensuring the actual memory-side atomic transaction only happens when the instruction is architecturally allowed to retire.",
    internalLogic: `Atomic memory operations cannot be treated like ordinary speculative stores. An AMO changes memory as part of an indivisible read-modify-write sequence, so firing it too early on a mispredicted path would violate architectural correctness.

amo_buffer solves this by decoupling:
  - execute-time decode/accept of the AMO instruction
  - commit-time authorization to actually perform the memory-side atomic op

FLOW:
  1. execute side recognizes an AMO and packages address/op/data/trans_id
  2. amo_buffer stores exactly one pending AMO entry
  3. commit_stage later signals that the oldest instruction is really committing
  4. amo_buffer forwards the request onto the D-cache atomic interface
  5. when response returns, the result is written back with the original trans_id

WHY SINGLE-ENTRY / SERIALIZED?
AMOs are rare and expensive. Simplicity and correctness matter more than throughput here. Allowing multiple speculative AMOs would complicate ordering, exception recovery, and exclusivity guarantees.

FLUSH INTERACTION:
If a pipeline flush happens before commit authorizes the AMO, the pending buffered operation is simply discarded. That is the whole point of buffering it instead of issuing it immediately.`,
    alwaysBlocks: [
      {
        label: "always_ff : pending AMO register",
        type: "seq",
        purpose: "Captures one AMO request and clears it on commit completion or flush.",
        code: `always_ff @(posedge clk_i or negedge rst_ni) begin
  if (!rst_ni) begin
    pending_valid_q <= 1'b0;
  end else begin
    if (flush_i) begin
      pending_valid_q <= 1'b0;
    end else if (valid_i && ready_o) begin
      pending_valid_q <= 1'b1;
      pending_req_q   <= amo_req_i;
    end else if (amo_commit_i && amo_resp_i.done) begin
      pending_valid_q <= 1'b0;
    end
  end
end`
      },
      {
        label: "always_comb : commit gate to D-cache",
        type: "comb",
        purpose: "Only releases the buffered AMO to the cache when commit authorizes it.",
        code: `always_comb begin : amo_issue
  dcache_req_port_o.valid = pending_valid_q && amo_commit_i;
  dcache_req_port_o.req   = pending_req_q;
  ready_o                 = !pending_valid_q;
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "The buffer prevents speculative side effects: an AMO does not touch memory until commit says the instruction is real.",
      "Single-entry buffering is a deliberate design choice: AMOs are serialized to preserve ordering and simplify correctness.",
      "AMO result writeback still needs the original transaction metadata so the scoreboard knows which instruction completed.",
      "Flush-before-commit behavior is simple: discard the buffered AMO and pretend it never happened architecturally." 
    ]
  },

  // ── WT_DCACHE ─────────────────────────────────────────────────────────────
  {
    module: "wt_dcache",
    path: "core/cache_subsystem/wt_dcache.sv",
    overview: "wt_dcache is the write-through data cache top level. It arbitrates multiple request sources from the LSU, looks up tags/data in the cache arrays, routes misses/refills toward AXI, and coordinates a write buffer so stores can complete under a write-through policy.",
    internalLogic: `A write-through cache keeps memory coherent in a straightforward way: every store updates lower memory as well as any cached copy. That avoids dirty-line writeback complexity, but it makes write buffering and refill coordination more important.

wt_dcache is the integration point for several cache-side structures:
  - request port arbitration (loads, stores, AMOs)
  - tag/data memory access
  - miss / refill control
  - write buffer management
  - AXI adapter connection

MULTI-PORT VIEW:
The LSU exposes distinct logical traffic classes: load path, store path, and AMO path. wt_dcache accepts those requests, chooses which one advances, and returns grants / responses on the corresponding internal interfaces.

WRITE-THROUGH CONSEQUENCE:
Stores are not just local cache updates. They also need downstream memory traffic. The design therefore relies on buffering so a short burst of stores does not completely stall the core whenever the external bus is slower than the pipeline.

FLUSH BEHAVIOR:
Cache flush/control requests need to coordinate with outstanding operations. The top-level cache module is where 'stop taking new work, drain what must drain, invalidate what must invalidate' gets assembled across sub-blocks.

In other words, wt_dcache is more of a subsystem coordinator than a single algorithmic block. The interesting logic is in how it wires arbitration, cache state, and external AXI traffic into one coherent memory backend.`,
    alwaysBlocks: [
      {
        label: "always_comb : port arbitration / request selection",
        type: "comb",
        purpose: "Chooses which internal LSU/cache request port gets service in the current cycle and routes responses back.",
        code: `always_comb begin : req_select
  selected_port = '0;
  cache_req     = '0;

  if (amo_req_i.valid) begin
    selected_port = AMO_PORT;
    cache_req     = amo_req_i;
  end else if (store_req_i.valid) begin
    selected_port = STORE_PORT;
    cache_req     = store_req_i;
  end else if (load_req_i.valid) begin
    selected_port = LOAD_PORT;
    cache_req     = load_req_i;
  end
end`
      },
      {
        label: "always_comb : flush / subsystem coordination",
        type: "comb",
        purpose: "Coordinates top-level cache-side control such as flush propagation, blocking, and response routing.",
        code: `always_comb begin : cache_top_ctrl
  cache_busy_o = ctrl_busy_i || wbuffer_busy_i || axi_busy_i;
  flush_done_o = flush_i && !cache_busy_o;

  ctrl_flush_i    = flush_i;
  wbuffer_flush_i = flush_i;
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "wt_dcache is a subsystem wrapper: its main value is coordinating arbitration, cache control, memory arrays, write buffer, and AXI interface.",
      "Write-through policy simplifies correctness relative to dirty write-back caches, but pushes more traffic into the write buffer / external memory path.",
      "Multiple LSU-originating request classes share the same cache backend, so arbitration and fairness matter for overall CPU throughput.",
      "Flush handling must consider the whole subsystem, not just the tag array — outstanding writes and AXI traffic matter too." 
    ]
  },

  // ── BHT2LVL ───────────────────────────────────────────────────────────────
  {
    module: "bht2lvl",
    path: "core/frontend/bht2lvl.sv",
    overview: "bht2lvl is the alternative two-level branch predictor used by CVA6 when configured for a more advanced frontend predictor. It augments plain per-branch saturating counters with global branch history, improving correlation prediction for branch patterns that a simple local BHT cannot capture.",
    internalLogic: `A classic 2-level predictor keeps two kinds of state:
  1. a global history register (GHR) summarizing recent taken/not-taken outcomes
  2. a pattern history table (PHT) of saturating counters indexed by some function of PC and history

In CVA6's gshare-style version, the predictor usually XORs pieces of the fetch PC with the GHR to form the lookup index. That means two static branches with different PCs but similar control-flow patterns can still map to useful predictor state.

PREDICTION FLOW:
  - frontend sends current PC
  - predictor computes index = PC bits XOR GHR
  - indexed 2-bit counter returns taken/not-taken prediction

UPDATE FLOW:
  - execute resolves the real branch outcome
  - predictor updates the corresponding 2-bit counter toward taken or not-taken
  - GHR shifts in the newest resolved outcome

WHY THIS HELPS:
A simple BHT only learns 'this branch is often taken.' A two-level predictor can learn correlated patterns such as 'this branch is taken every other time' or 'taken only if a previous branch was taken.' That matters in real CPU control-flow where branches are often not independent.

COST:
The predictor is more accurate than a trivial BHT, but it is also more stateful and slightly more complex to update/recover. Like all speculative predictors, wrong guesses are still corrected by execute-stage resolution and pipeline flush.`,
    alwaysBlocks: [
      {
        label: "always_comb : gshare lookup",
        type: "comb",
        purpose: "Forms the prediction index from PC/history and reads the 2-bit counter to produce a taken/not-taken guess.",
        code: `always_comb begin : bht2lvl_lookup
  index = vpc_i[IDX_MSB:IDX_LSB] ^ ghr_q;
  counter = pht_q[index];
  bht_prediction_o.valid = 1'b1;
  bht_prediction_o.taken = counter[1]; // MSB of 2-bit saturating counter
end`
      },
      {
        label: "always_ff : PHT + GHR update",
        type: "seq",
        purpose: "Updates the saturating counter and shifts the resolved branch outcome into the global history register.",
        code: `always_ff @(posedge clk_i or negedge rst_ni) begin
  if (!rst_ni) begin
    ghr_q <= '0;
  end else if (bht_update_i.valid) begin
    pht_q[update_index] <= next_counter_value;
    ghr_q <= {ghr_q[GHR_LEN-2:0], bht_update_i.taken};
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "The GHR captures recent branch outcomes, letting the predictor model correlated control-flow rather than only per-branch bias.",
      "Using XOR of PC and GHR (gshare) reduces some destructive aliasing relative to indexing only by PC or only by history.",
      "Prediction state is speculative in effect but updated from resolved branch outcomes, not guesses.",
      "Even a better predictor is still advisory only — branch_unit remains the architectural source of truth for control flow." 
    ]
  },

  // ── FPU_WRAP ──────────────────────────────────────────────────────────────
  {
    module: "fpu_wrap",
    path: "core/fpu_wrap.sv",
    overview: "fpu_wrap adapts CVA6's execution-stage interface to the external CV-FPU implementation. It packages floating-point operands, operation codes, rounding mode, and destination metadata into the form expected by fpnew/cvfpu, then converts the response back into CVA6 writeback form.",
    internalLogic: `The floating-point unit is conceptually just another functional unit, but it differs from ALU/branch logic in three ways:
  1. many operations are multi-cycle and variable-latency
  2. floating-point exceptions (fflags) must be captured architecturally
  3. operand/result formats include both integer and FP conversion cases

fpu_wrap exists so ex_stage does not need to understand CV-FPU internals directly.

RESPONSIBILITIES:
  - decode CVA6 fu_data_t fields into CV-FPU op format
  - select operands and rounding mode
  - pass valid/ready handshakes through
  - capture result, exception flags, and trans_id for writeback
  - indicate when FP architectural state becomes dirty

LATENCY HANDLING:
Unlike a combinational ALU, floating-point operations may complete after several cycles, and the latency can depend on the operation (add vs divide vs sqrt). The wrapper therefore tracks the request/response handshake and preserves transaction metadata until the result comes back.

ISA-LEVEL IMPORTANCE:
The wrapper is also where architectural FP side effects become visible to the rest of the core: result register writeback and fflags update. That makes it the integration boundary between the generic CPU pipeline and the specialized FP datapath.`,
    alwaysBlocks: [
      {
        label: "always_comb : request packing",
        type: "comb",
        purpose: "Maps CVA6 functional-unit inputs into the operand/opcode/rounding format expected by CV-FPU.",
        code: `always_comb begin : fpu_req_pack
  fpu_req_o.valid = fpu_valid_i;
  fpu_req_o.op    = fu_data_i.operation;
  fpu_req_o.rs1   = fu_data_i.operand_a;
  fpu_req_o.rs2   = fu_data_i.operand_b;
  fpu_req_o.rs3   = fu_data_i.imm;
  fpu_req_o.rm    = fu_data_i.rm;
end`
      },
      {
        label: "always_ff : response capture",
        type: "seq",
        purpose: "Captures returning FP result metadata and exception flags for writeback into the core.",
        code: `always_ff @(posedge clk_i or negedge rst_ni) begin
  if (!rst_ni) begin
    resp_valid_q <= 1'b0;
  end else if (fpu_resp_i.valid) begin
    resp_valid_q <= 1'b1;
    result_q     <= fpu_resp_i.result;
    fflags_q     <= fpu_resp_i.fflags;
    trans_id_q   <= trans_id_i;
  end else if (result_ready_i) begin
    resp_valid_q <= 1'b0;
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "fpu_wrap is an interface adapter, not the floating-point math engine itself; CV-FPU does the arithmetic.",
      "Variable-latency completion means the wrapper must preserve bookkeeping so writeback still targets the correct in-flight instruction.",
      "FP exception flags are architectural state and must travel alongside the numerical result.",
      "The wrapper allows ex_stage to treat FP execution like a standard valid/ready functional unit despite very different internals." 
    ]
  },

  // ── DM_TOP ────────────────────────────────────────────────────────────────
  {
    module: "dm_top",
    path: "core/debug/dm_top.sv",
    overview: "dm_top is the top-level RISC-V external debug module. It sits outside the normal execution pipeline and gives a debugger the ability to halt the hart, inspect state, run abstract commands, and access memory through the standardized debug transport path.",
    internalLogic: `The debug module is not part of the architectural fast path, but it is crucial for bring-up, validation, and post-silicon debugging.

TOP-LEVEL ROLE:
  - receive debug transport requests (via DMI/JTAG stack in the SoC)
  - expose debug CSRs/status
  - request the CPU halt or resume
  - orchestrate abstract register/memory access commands
  - provide a program buffer path for more complex debug actions

INTERACTION WITH CVA6:
From the CPU's perspective, dm_top mostly appears as a debug request/control source. When asserted, the hart enters debug mode, saves the necessary context (through dpc/dcsr flow), and redirects execution into the debug machinery.

WHY SEPARATE MODULE?
Debug logic has different requirements from the core datapath: correctness matters more than raw timing, it may cross clock/protocol domains, and it needs strong compliance with the RISC-V debug specification. Keeping it modular prevents the CPU fast path from becoming polluted with low-frequency debug plumbing.

ABSTRACTLY:
Think of dm_top as the supervisor of all out-of-band control over the hart. Normal software uses architectural instructions; the debugger uses dm_top as an alternate control plane.`,
    alwaysBlocks: [
      {
        label: "always_comb : debug request generation",
        type: "comb",
        purpose: "Decides when the hart should be halted, resumed, or serviced for an abstract debug command.",
        code: `always_comb begin : dm_ctrl
  debug_req_o = dmactive_i && haltreq_i;
  resume_o    = dmactive_i && resumereq_i;
  cmdbusy_o   = abstract_cmd_inflight_q;
end`
      },
      {
        label: "always_ff : debug command state",
        type: "seq",
        purpose: "Tracks whether an abstract command or debug operation is currently active.",
        code: `always_ff @(posedge clk_i or negedge rst_ni) begin
  if (!rst_ni) begin
    abstract_cmd_inflight_q <= 1'b0;
  end else begin
    if (cmd_start_i)
      abstract_cmd_inflight_q <= 1'b1;
    else if (cmd_done_i)
      abstract_cmd_inflight_q <= 1'b0;
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "dm_top is an out-of-band control plane for the hart: halt, inspect, single-step, resume.",
      "It is logically separate from the CPU pipeline, which helps preserve fast-path simplicity and timing.",
      "Abstract commands and program buffer execution allow flexible debugging without inventing ad hoc backdoors.",
      "Correct interaction with debug mode is architectural: the hart must stop/resume in a spec-compliant way, not just 'pause somehow'." 
    ]
  },

  // ── FIFO_V3 ───────────────────────────────────────────────────────────────
  {
    module: "fifo_v3",
    path: "vendor/pulp-platform/common_cells/src/fifo_v3.sv",
    overview: "fifo_v3 is the general-purpose synchronous FIFO used across the design for decoupling producer/consumer timing. It provides the standard queue abstraction: push data in at the tail, pop data out at the head, and report empty/full/usage state.",
    internalLogic: `This is one of the most reusable utility blocks in the project. Although simple conceptually, FIFOs are everywhere because pipelines constantly need elasticity between stages running at different instantaneous rates.

CORE STATE:
  - storage array for entries
  - write pointer
  - read pointer
  - occupancy / usage tracking

BEHAVIOR:
  push_i when not full  -> write new entry, advance write pointer
  pop_i when not empty  -> consume oldest entry, advance read pointer
  push+pop together     -> occupancy may remain constant while pointers both move

FALL-THROUGH MODE:
Many common_cells FIFOs support a mode where if the FIFO is empty and a push arrives, the data may be immediately visible on the output without waiting a full extra cycle. This reduces latency in lightly loaded pipelines.

WHY IMPORTANT IN CPUS?
FIFOs convert hard cycle-by-cycle coupling into clean backpressure contracts. The frontend instruction queue, LSU request buffering, and many other structures become dramatically easier to reason about once isolated with a FIFO boundary.`,
    alwaysBlocks: [
      {
        label: "always_comb : status flags",
        type: "comb",
        purpose: "Derives empty/full/usage outputs from pointer and occupancy state.",
        code: `always_comb begin : fifo_status
  empty_o = (usage_q == 0);
  full_o  = (usage_q == DEPTH);
  usage_o = usage_q;
end`
      },
      {
        label: "always_ff : pointer / memory update",
        type: "seq",
        purpose: "Updates FIFO storage, read/write pointers, and occupancy based on push/pop activity.",
        code: `always_ff @(posedge clk_i or negedge rst_ni) begin
  if (!rst_ni) begin
    rd_ptr_q <= '0;
    wr_ptr_q <= '0;
    usage_q  <= '0;
  end else begin
    if (push_i && !full_o) begin
      mem_q[wr_ptr_q] <= data_i;
      wr_ptr_q <= wr_ptr_q + 1'b1;
    end
    if (pop_i && !empty_o)
      rd_ptr_q <= rd_ptr_q + 1'b1;
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "fifo_v3 is infrastructure: many higher-level CPU structures depend on it for clean decoupling and backpressure.",
      "Simultaneous push/pop behavior is critical; many bugs in custom FIFOs come from mishandling occupancy updates when both happen together.",
      "Fall-through mode trades a bit of implementation complexity for lower queue latency when traffic is sparse.",
      "A good FIFO is boring in the best way: heavily reused, timing-clean, and behaviorally obvious." 
    ]
  },

  // ── RR_ARB_TREE ───────────────────────────────────────────────────────────
  {
    module: "rr_arb_tree",
    path: "vendor/pulp-platform/common_cells/src/rr_arb_tree.sv",
    overview: "rr_arb_tree is a round-robin arbiter used when several requesters compete for one shared resource. Instead of always prioritizing requester 0, it rotates priority after each grant, preventing starvation and improving fairness under sustained contention.",
    internalLogic: `Arbitration is a hidden but essential part of real hardware systems. Whenever multiple sources want one sink — cache ports, issue slots, shared buses — something must choose who wins.

ROUND-ROBIN PRINCIPLE:
  - maintain a rotating priority pointer or mask
  - grant the first requester found after that pointer
  - after a grant, advance the pointer for the next arbitration

TREE STRUCTURE:
The 'tree' implementation scales arbitration across many inputs efficiently instead of writing one huge flat priority chain. That improves timing and structure for larger request counts.

WHY NOT FIXED PRIORITY?
Fixed priority is simple but can starve low-priority requesters if high-priority ones stay busy. For shared subsystems like caches, that can create pathological latency and hurt throughput fairness.

INTERACTION WITH LZC:
A leading-zero counter or priority encoder primitive is often used to find the first active requester in a masked vector. rr_arb_tree builds fairness policy around that primitive.`,
    alwaysBlocks: [
      {
        label: "always_comb : masked request select",
        type: "comb",
        purpose: "Applies the current round-robin mask/pointer and chooses the next requester to grant.",
        code: `always_comb begin : rr_select
  masked_req = req_i & rr_mask_q;
  if (|masked_req)
    winner = first_one(masked_req);
  else
    winner = first_one(req_i);
end`
      },
      {
        label: "always_ff : rotation state update",
        type: "seq",
        purpose: "Advances the round-robin priority after a successful grant so the next arbitration starts from the following requester.",
        code: `always_ff @(posedge clk_i or negedge rst_ni) begin
  if (!rst_ni) begin
    rr_mask_q <= '1;
  end else if (gnt_i) begin
    rr_mask_q <= next_rr_mask(winner);
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "Round-robin arbitration is about fairness over time, not just choosing a winner this cycle.",
      "The tree structure keeps arbitration scalable and timing-friendly as requester count grows.",
      "Mask-then-wrap behavior is the key idea: search from the current priority point, then wrap around if needed.",
      "This utility block often matters more for system throughput than its small size suggests." 
    ]
  },

  // ── LZC ───────────────────────────────────────────────────────────────────
  {
    module: "lzc",
    path: "vendor/pulp-platform/common_cells/src/lzc.sv",
    overview: "lzc is the common_cells leading/trailing zero counter and priority-encoding primitive. Given a bit vector, it finds the position of the first interesting bit and reports whether the vector is empty, making it useful for CLZ/CTZ instructions, arbiters, and free-slot search logic.",
    internalLogic: `At first glance, counting leading zeros looks like a tiny helper. In practice it is a foundational primitive for many hardware tasks:
  - CLZ/CTZ instructions in the ALU
  - priority encoding in arbiters
  - locating free/used entries in scoreboards/FIFOs

FUNCTIONALLY:
  input  -> bit vector
  output -> count/index + empty indication

IMPLEMENTATION STYLE:
common_cells often uses recursive or tree-based generate logic so the structure scales with width. This is better than writing a giant hand-coded case statement for every vector size.

LEADING VS TRAILING:
Depending on configuration, the same structural idea can search from MSB downward or from LSB upward. That makes the module broadly reusable.

WHY EXPOSE EMPTY?
If no bit is set (or no zero is found, depending on convention), the numeric count alone is ambiguous. empty_o tells surrounding logic whether the reported count is meaningful.`,
    alwaysBlocks: [
      {
        label: "always_comb : priority encode",
        type: "comb",
        purpose: "Encodes the first matching bit position and reports whether the input vector contains any candidate at all.",
        code: `always_comb begin : lzc_comb
  cnt_o   = '0;
  empty_o = ~(|in_i);
  for (int i = WIDTH-1; i >= 0; i--) begin
    if (in_i[i])
      cnt_o = WIDTH-1-i;
  end
end`
      }
    ],
    stateMachines: [],
    keyDesignPoints: [
      "lzc is a reusable primitive, not just an ALU helper; arbiters and resource trackers depend on the same core operation.",
      "Reporting empty separately avoids ambiguity when no candidate bit exists.",
      "Parameterized width makes the block broadly reusable across datapath/control logic.",
      "This kind of tiny utility module often becomes timing-critical because it sits inside larger control structures." 
    ]
  },

  // ── ARIANE_PKG ────────────────────────────────────────────────────────────
  {
    module: "ariane_pkg",
    path: "core/include/ariane_pkg.sv",
    overview: "ariane_pkg is the semantic vocabulary of CVA6. It defines the enums, structs, helper functions, and operation encodings that let separate modules agree on what an instruction is, what functional unit should execute it, and how control/data move across the pipeline.",
    internalLogic: `Packages are not datapath modules, but they are absolutely central to understanding the design. ariane_pkg is where CVA6 defines things like:
  - functional unit enums (ALU, BRANCH, LOAD/STORE, MULT, CSR, FPU)
  - operation enums inside those units
  - shared structs passed between stages (scoreboard entry, branch resolution info, etc.)
  - helper predicates such as is_store(), is_amo(), or state classification functions

WHY THIS MATTERS:
Without a common package, every module would have to redefine encodings and record layouts manually, which is fragile and unreadable. Packages provide a single source of truth.

DESIGN EFFECT:
When decoder marks an instruction as a LOAD with a specific operation enum, issue/ex_stage/commit all rely on ariane_pkg to interpret those fields consistently. In other words, this package is what makes the whole pipeline type-safe at the SystemVerilog level.

MENTAL MODEL:
If the modules are the organs of the CPU, ariane_pkg is the shared language they all speak.`,
    alwaysBlocks: [],
    stateMachines: [],
    keyDesignPoints: [
      "ariane_pkg defines semantic contracts between modules — especially enums and packed structs used throughout the pipeline.",
      "Helper functions centralize common classification logic so every module does not reinvent its own decode predicates.",
      "A bug in package definitions can ripple across the entire CPU because many blocks interpret the same types.",
      "Reading this package early makes the rest of the RTL dramatically easier to follow." 
    ]
  },

  // ── CONFIG_PKG ────────────────────────────────────────────────────────────
  {
    module: "config_pkg",
    path: "core/include/config_pkg.sv",
    overview: "config_pkg defines the CPU configuration structure and derived design parameters. It is the knob panel for CVA6: XLEN, feature enables, issue/commit widths, buffer sizes, extension support, and many other architectural or microarchitectural choices originate here.",
    internalLogic: `A configurable CPU needs one coherent place where feature and sizing choices are defined. config_pkg provides that single source of truth.

TYPICAL CONTENT:
  - width parameters (XLEN, physical address size, vector sizes)
  - issue/commit counts
  - feature booleans (debug, floating point, compressed ISA, supervisor mode, etc.)
  - cache/TLB/buffer sizing parameters
  - derived configuration structs used by the rest of the design

WHY THIS IS IMPORTANT:
Configuration is not just syntactic convenience. It controls what hardware actually exists. Turning off FP or changing buffer depths alters structures, interfaces, and behavior across many modules.

ENGINEERING BENEFIT:
By funneling configuration through a package/struct, the design avoids ad hoc parameter spaghetti. Modules can depend on a common configuration object instead of dozens of loosely related parameters.

PRACTICAL READING TIP:
When trying to understand why a code path is conditional or why a module has a certain width, config_pkg is usually the first place to check.`,
    alwaysBlocks: [],
    stateMachines: [],
    keyDesignPoints: [
      "config_pkg is the single point of truth for architectural and microarchitectural feature configuration.",
      "Many generate-time conditionals across the RTL depend on fields defined here.",
      "Changing one configuration field can reshape interfaces, depths, or even whole feature blocks across the core.",
      "Understanding the active config is often necessary before judging whether a code path is dead, optional, or mandatory." 
    ]
  },

  // ── RISCV_PKG ─────────────────────────────────────────────────────────────
  {
    module: "riscv_pkg",
    path: "core/include/riscv_pkg.sv",
    overview: "riscv_pkg is the hardware encoding dictionary for the RISC-V specification inside CVA6. It defines opcodes, funct fields, privilege-level constants, exception causes, CSR addresses, PTE bit fields, and many other architectural constants used everywhere from decode to MMU to CSR handling.",
    internalLogic: `If ariane_pkg is the CPU's internal language, riscv_pkg is its link to the external ISA specification.

This package contains the constants that translate the written RISC-V spec into hardware-readable symbols:
  - instruction opcode/funct constants for decoder logic
  - privilege mode encodings (M/S/U)
  - exception and interrupt cause numbers
  - CSR addresses and field constants
  - page table / PTE definitions for virtual memory logic

WHY CENTRALIZE THIS?
Because these encodings must be globally consistent. decoder, csr_regfile, ptw, trap logic, and debug/privilege code all need the exact same architectural constants.

DESIGN VALUE:
Using named constants instead of raw hex literals makes RTL far more readable and less error-prone. A statement like CSR_MSTATUS is self-explanatory; 12'h300 is not.

READING VALUE:
When you see symbolic names in the RTL and want to know what they mean architecturally, riscv_pkg is where the answer lives.`,
    alwaysBlocks: [],
    stateMachines: [],
    keyDesignPoints: [
      "riscv_pkg binds CVA6 to the RISC-V ISA's architectural encodings and constants.",
      "Decoder, trap logic, CSR logic, and MMU code all rely on these definitions being exact.",
      "Named architectural constants make the RTL much more maintainable than magic-number-heavy code.",
      "This package is especially useful when cross-referencing RTL behavior against the RISC-V spec." 
    ]
  }
];

export const getAnalysisByModule = (module: string): FileAnalysis | undefined =>
  fileAnalyses.find(a => a.module === module);

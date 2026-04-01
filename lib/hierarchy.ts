// CVA6 Complete Source Hierarchy
// Derived from core/Flist.cva6 and directory exploration

export interface SourceFile {
  path: string;           // relative path from repo root
  module: string;         // top-level module name
  description: string;   // what this file does
  instantiatedBy: string[]; // parent modules that instantiate this
  instantiates: string[]; // child modules this file instantiates
  keySignals?: string[];  // most important interface signals
  category: HierarchyCategory;
  importance: "top" | "critical" | "supporting" | "utility";
}

export type HierarchyCategory =
  | "Top Level"
  | "Frontend"
  | "Decode & Issue"
  | "Execute"
  | "Memory & Cache"
  | "MMU & TLB"
  | "Privileged Architecture"
  | "Floating Point"
  | "Debug"
  | "Common Cells"
  | "Packages & Config";

export const cva6Hierarchy: SourceFile[] = [

  // ── TOP LEVEL ──────────────────────────────────────────────────────────────
  {
    path: "core/cva6.sv",
    module: "cva6",
    description: "The top-level CPU module. Instantiates every pipeline stage and defines all inter-stage data types as localparam packed structs. All data paths between modules (fetch_entry_t, scoreboard_entry_t, fu_data_t, bp_resolve_t) are defined here.",
    instantiatedBy: ["SoC top-level / testbench"],
    instantiates: ["frontend", "id_stage", "issue_stage", "ex_stage", "commit_stage", "controller", "csr_regfile", "load_store_unit", "cva6_icache_axi_wrapper", "wt_dcache"],
    keySignals: ["clk_i", "rst_ni", "boot_addr_i", "axi_req_o", "axi_resp_i", "irq_i"],
    category: "Top Level",
    importance: "top"
  },
  {
    path: "core/controller.sv",
    module: "controller",
    description: "The pipeline flush controller — the 'traffic cop' of the CPU. Receives all flush/halt requests (branch misprediction, exception, fence, CSR write, WFI) and generates per-stage flush signals. Every flush in the CPU goes through here.",
    instantiatedBy: ["cva6"],
    instantiates: [],
    keySignals: ["flush_if_o", "flush_id_o", "flush_ex_o", "flush_unissued_instr_o", "flush_icache_o", "flush_dcache_o", "flush_tlb_o", "halt_o", "resolved_branch_i", "ex_valid_i", "fence_i_i", "sfence_vma_i"],
    category: "Top Level",
    importance: "critical"
  },

  // ── FRONTEND ──────────────────────────────────────────────────────────────
  {
    path: "core/frontend/frontend.sv",
    module: "frontend",
    description: "Instruction fetch orchestrator. Generates the next PC (priority mux: exception > eret > mispredict > CSR > BPred > PC+4), issues I-cache requests, manages the fetch queue, and produces fetch_entry_t structs for decode. Instantiates bht, btb, and the RAS internally.",
    instantiatedBy: ["cva6"],
    instantiates: ["bht", "btb", "instr_queue"],
    keySignals: ["icache_dreq_o", "icache_dreq_i", "fetch_entry_o", "flush_i", "resolved_branch_i", "boot_addr_i"],
    category: "Frontend",
    importance: "critical"
  },
  {
    path: "core/frontend/bht.sv",
    module: "bht",
    description: "Branch History Table — 2-bit saturating counter array (1024 entries default). Predicts TAKEN/NOT-TAKEN for conditional branches. MSB of counter = prediction. Updated on every branch resolution from the execute stage.",
    instantiatedBy: ["frontend"],
    instantiates: [],
    keySignals: ["vpc_i", "bht_prediction_o", "bht_update_i"],
    category: "Frontend",
    importance: "critical"
  },
  {
    path: "core/frontend/bht2lvl.sv",
    module: "bht2lvl",
    description: "Two-level adaptive branch predictor (alternative to the simple BHT). Uses a Global History Register (GHR) XORed with the PC to index a pattern history table — this is the gshare predictor. Selectable via CVA6 configuration.",
    instantiatedBy: ["frontend (conditional)"],
    instantiates: [],
    keySignals: ["vpc_i", "bht_prediction_o", "bht_update_i", "ghr (internal GHR register)"],
    category: "Frontend",
    importance: "supporting"
  },
  {
    path: "core/frontend/btb.sv",
    module: "btb",
    description: "Branch Target Buffer — stores branch PC → target address mappings (8 entries default). Provides the predicted jump destination for taken branches before the instruction is decoded. ASIC: flip-flop storage with flush. FPGA: BRAM storage without flush.",
    instantiatedBy: ["frontend"],
    instantiates: [],
    keySignals: ["vpc_i", "btb_prediction_o", "btb_update_i"],
    category: "Frontend",
    importance: "critical"
  },

  // ── DECODE & ISSUE ────────────────────────────────────────────────────────
  {
    path: "core/id_stage.sv",
    module: "id_stage",
    description: "Decode stage wrapper. Consumes fetch_entry_t from frontend, instantiates decoder.sv for each issue port, handles compressed instruction expansion, checks interrupt pending state, and produces scoreboard_entry_t for the issue stage.",
    instantiatedBy: ["cva6"],
    instantiates: ["decoder", "compressed_decoder"],
    keySignals: ["fetch_entry_i", "issue_entry_o", "irq_ctrl_i", "flush_i"],
    category: "Decode & Issue",
    importance: "critical"
  },
  {
    path: "core/decoder.sv",
    module: "decoder",
    description: "The instruction decoder. Pure combinational logic: maps 32-bit instruction → scoreboard_entry_t (fu, op, rs1, rs2, rd, immediate, use_imm, exception). Handles all RV64GC opcodes plus RISC-V extensions (B, Zcmp, Zcmt, hypervisor). The largest always_comb block in the design.",
    instantiatedBy: ["id_stage"],
    instantiates: [],
    keySignals: ["instruction_i", "instruction_o (scoreboard_entry_t)", "illegal_instr_o", "ecall_o", "ebreak_o"],
    category: "Decode & Issue",
    importance: "critical"
  },
  {
    path: "core/compressed_decoder.sv",
    module: "compressed_decoder",
    description: "RISC-V C extension decoder. Converts 16-bit compressed instructions to their 32-bit RV equivalents. Pure combinational, runs in parallel with the main decoder in id_stage. 1:1 mapping for every C.* instruction.",
    instantiatedBy: ["id_stage"],
    instantiates: [],
    keySignals: ["instr_i (16-bit)", "instr_o (32-bit expanded)", "is_compressed_o", "illegal_instr_o"],
    category: "Decode & Issue",
    importance: "supporting"
  },
  {
    path: "core/issue_stage.sv",
    module: "issue_stage",
    description: "Issue stage: allocates scoreboard entries, reads register file operands, checks RAW hazards, handles forwarding from writeback buses, and dispatches fu_data_t to functional units. Instantiates the scoreboard and the register file read logic.",
    instantiatedBy: ["cva6"],
    instantiates: ["scoreboard", "ariane_regfile_ff"],
    keySignals: ["decoded_instr_i", "fu_data_o", "rs1_forwarding_o", "rs2_forwarding_o", "commit_instr_o", "wb_valid_i", "wb_trans_id_i"],
    category: "Decode & Issue",
    importance: "critical"
  },
  {
    path: "core/scoreboard.sv",
    module: "scoreboard",
    description: "The out-of-order tracking structure. FIFO of sb_mem_t entries (issued + cancelled + scoreboard_entry_t). Allocates slots at dispatch, marks them complete on writeback (trans_id indexed), presents oldest entry to commit. Handles misprediction squash via cancelled bit.",
    instantiatedBy: ["issue_stage"],
    instantiates: [],
    keySignals: ["decoded_instr_i", "issue_instr_o", "commit_instr_o", "commit_drop_o", "trans_id_i (NrWbPorts)", "wbdata_i (NrWbPorts)", "resolved_branch_i"],
    category: "Decode & Issue",
    importance: "critical"
  },
  {
    path: "core/ariane_regfile_ff.sv",
    module: "ariane_regfile_ff",
    description: "32×64-bit integer register file (flip-flop based). 2 async read ports, NrCommitPorts sync write ports. x0 reads always return 0; writes to x0 are silently discarded. ASIC target. ariane_regfile_fpga.sv is the BRAM variant.",
    instantiatedBy: ["issue_stage"],
    instantiates: [],
    keySignals: ["raddr_a_i/b_i (read addresses)", "rdata_a_o/b_o (read data)", "waddr_i/wdata_i/we_i (write port)", "clk_i"],
    category: "Decode & Issue",
    importance: "critical"
  },

  // ── EXECUTE ───────────────────────────────────────────────────────────────
  {
    path: "core/ex_stage.sv",
    module: "ex_stage",
    description: "Execute stage orchestrator. Instantiates all functional units (ALU, BU, LSU, MULT, CSR, FPU) and routes fu_data_t to the correct unit. Collects writeback results and broadcasts them to the scoreboard. Also manages the alu_result_ex_id_o direct forwarding path.",
    instantiatedBy: ["cva6"],
    instantiates: ["alu", "branch_unit", "load_store_unit", "mult", "fpu_wrap"],
    keySignals: ["fu_data_i", "alu_valid_i", "lsu_valid_i", "resolved_branch_o", "alu_result_ex_id_o", "dcache_req_ports_o", "wbdata_o"],
    category: "Execute",
    importance: "critical"
  },
  {
    path: "core/alu.sv",
    module: "alu",
    description: "Integer ALU. Fully combinational. Implements: ADD/SUB (carry-save adder), AND/OR/XOR, shifts (SLL/SRL/SRA), comparisons (SLT/SLTU), and B-extension operations (ANDN, ORN, XNOR, CLZ, CTZ, CPOP, REV8, BEXT, etc.). Outputs branch compare result to branch_unit.",
    instantiatedBy: ["ex_stage"],
    instantiates: ["lzc (from common_cells)"],
    keySignals: ["fu_data_i (op+operands)", "result_o", "alu_branch_res_o"],
    category: "Execute",
    importance: "critical"
  },
  {
    path: "core/alu_wrapper.sv",
    module: "alu_wrapper",
    description: "Wraps alu.sv to add the valid/ready pipeline handshake for issue stage dispatch. Registers the result for 1 cycle before asserting valid. Used in the 2-wide issue port configuration.",
    instantiatedBy: ["ex_stage"],
    instantiates: ["alu"],
    keySignals: ["valid_i", "ready_o", "result_o", "trans_id_o"],
    category: "Execute",
    importance: "supporting"
  },
  {
    path: "core/branch_unit.sv",
    module: "branch_unit",
    description: "Resolves branches and jumps. Computes the actual target address (jump_base + imm) and compares against the BHT/BTB prediction. Outputs bp_resolve_t: is_mispredict, target_address, is_taken. A single cycle, combinational output.",
    instantiatedBy: ["ex_stage"],
    instantiates: [],
    keySignals: ["fu_data_i", "branch_comp_res_i (from ALU)", "branch_predict_i", "resolved_branch_o", "branch_result_o (return address)"],
    category: "Execute",
    importance: "critical"
  },
  {
    path: "core/mult.sv",
    module: "mult",
    description: "Multiply-Divide unit. Instantiates multiplier.sv and serdiv.sv. MUL uses a 3-cycle Booth's multiplier. DIV/REM uses a serial (iterative) SRT divider taking up to 64 cycles. The mult unit stalls issue via ready_o=0 while dividing.",
    instantiatedBy: ["ex_stage"],
    instantiates: ["multiplier", "serdiv"],
    keySignals: ["fu_data_i", "mult_valid_i", "mult_ready_o", "result_o (trans_id tagged)"],
    category: "Execute",
    importance: "supporting"
  },
  {
    path: "core/multiplier.sv",
    module: "multiplier",
    description: "3-cycle pipelined multiplier for MUL, MULH, MULHSU, MULHU, MULW. Uses SystemVerilog's built-in * operator mapped to a Booth's multiplier by synthesis. Pipeline registers inserted after each cycle for timing.",
    instantiatedBy: ["mult"],
    instantiates: [],
    keySignals: ["operand_a_i", "operand_b_i", "operation_i", "result_o", "ready_o"],
    category: "Execute",
    importance: "supporting"
  },
  {
    path: "core/serdiv.sv",
    module: "serdiv",
    description: "Serial SRT divider for DIV, DIVU, REM, REMU. Iterative restoring division, one bit per cycle, 32–64 cycles for a 64-bit divide. A state machine drives the iteration. The most latency-intensive functional unit in CVA6.",
    instantiatedBy: ["mult"],
    instantiates: [],
    keySignals: ["op_a_i", "op_b_i", "opcode_i", "in_vld_i", "out_vld_o", "res_o"],
    category: "Execute",
    importance: "supporting"
  },

  // ── MEMORY & CACHE ────────────────────────────────────────────────────────
  {
    path: "core/load_store_unit.sv",
    module: "load_store_unit",
    description: "The LSU top-level. Instantiates the MMU, load_unit, and store_unit. Handles address generation, TLB lookup, D-cache access, store buffer management, and store-to-load forwarding. Has 3 D-cache ports (load/store/AMO).",
    instantiatedBy: ["ex_stage"],
    instantiates: ["mmu", "load_unit", "store_unit", "amo_buffer"],
    keySignals: ["fu_data_i", "lsu_ready_o", "load_result_o", "store_result_o", "commit_i", "dcache_req_ports_o[3]"],
    category: "Memory & Cache",
    importance: "critical"
  },
  {
    path: "core/load_unit.sv",
    module: "load_unit",
    description: "Handles load instructions. State machine: IDLE → WAIT_TRANSLATION → WAIT_GRANT → SEND_TAG → WAIT_CRITICAL_WORD → COMPLETE. Checks store buffer for forwarding before going to cache. Handles data alignment (byte/halfword/word/doubleword extraction).",
    instantiatedBy: ["load_store_unit"],
    instantiates: [],
    keySignals: ["lsu_ctrl_i", "dcache_req_port_o", "dcache_req_port_i", "store_buffer_*_i (forwarding inputs)", "load_result_o", "load_valid_o"],
    category: "Memory & Cache",
    importance: "critical"
  },
  {
    path: "core/store_unit.sv",
    module: "store_unit",
    description: "Handles store instructions and the store buffer. Stores go into the buffer at execute time (speculative). At commit (pop_st_i pulse), the oldest entry is drained to D-cache. Also checks for store address alignment exceptions.",
    instantiatedBy: ["load_store_unit"],
    instantiates: [],
    keySignals: ["lsu_ctrl_i", "valid_i", "pop_st_i (commit drain)", "no_st_pending_o", "dcache_req_port_o", "store_buffer_*_o (for load forwarding)"],
    category: "Memory & Cache",
    importance: "critical"
  },
  {
    path: "core/amo_buffer.sv",
    module: "amo_buffer",
    description: "Atomic Memory Operation (AMO) buffer. Holds one in-flight AMO operation (AMOSWAP, AMOADD, AMOAND, etc.) waiting for commit. AMOs require exclusive cache access and are serialized through this buffer.",
    instantiatedBy: ["load_store_unit"],
    instantiates: [],
    keySignals: ["valid_i", "flush_i", "amo_commit_i", "dcache_req_port_o"],
    category: "Memory & Cache",
    importance: "supporting"
  },
  {
    path: "core/cache_subsystem/wt_dcache.sv",
    module: "wt_dcache",
    description: "Write-through D-cache top level (WT = write-through variant). Instantiates wt_dcache_ctrl (miss handler), wt_dcache_mem (SRAM arrays), and wt_dcache_wbuffer (write buffer). Manages 3 request ports. Connects to AXI via axi_adapter.",
    instantiatedBy: ["cva6"],
    instantiates: ["wt_dcache_ctrl", "wt_dcache_mem", "wt_dcache_wbuffer", "axi_adapter"],
    keySignals: ["req_ports_i[3]", "req_ports_o[3]", "axi_data_o", "axi_data_i", "flush_i"],
    category: "Memory & Cache",
    importance: "critical"
  },
  {
    path: "core/cache_subsystem/cache_ctrl.sv",
    module: "cache_ctrl",
    description: "D-cache controller for one request port. State machine handles: HIT (return data same cycle), MISS (send refill request to AXI), EVICT (write dirty line to AXI), REPLAY (retry after line refill). Manages the 4-way set-associative lookup.",
    instantiatedBy: ["wt_dcache"],
    instantiates: [],
    keySignals: ["req_port_i", "req_port_o", "tag_o", "data_o", "hit_way_o", "miss_o", "refill_*"],
    category: "Memory & Cache",
    importance: "critical"
  },
  {
    path: "core/cache_subsystem/axi_adapter.sv",
    module: "axi_adapter",
    description: "AXI4 master interface adapter. Converts internal cache miss/refill requests to AXI4 burst transactions. Handles: AR channel (read address), R channel (read data), AW channel (write address), W channel (write data), B channel (write response). Supports multiple outstanding transactions via AXI IDs.",
    instantiatedBy: ["wt_dcache"],
    instantiates: [],
    keySignals: ["axi_req_o", "axi_resp_i", "rd_req_i", "wr_req_i", "rd_data_o", "rd_valid_o"],
    category: "Memory & Cache",
    importance: "critical"
  },

  // ── MMU & TLB ─────────────────────────────────────────────────────────────
  {
    path: "core/mmu.sv",
    module: "mmu",
    description: "Memory Management Unit top level. Instantiates ITLB, DTLB, and the Page Table Walker (PTW). Translates virtual addresses to physical addresses for fetch (via ITLB) and load/store (via DTLB). Handles TLB miss → PTW → refill flow.",
    instantiatedBy: ["load_store_unit", "frontend (via icache_areq)"],
    instantiates: ["tlb (ITLB)", "tlb (DTLB)", "ptw"],
    keySignals: ["lsu_vaddr_i", "lsu_paddr_o", "lsu_exception_o", "itlb_miss_o", "dtlb_miss_o", "walking_instr_o"],
    category: "MMU & TLB",
    importance: "critical"
  },
  {
    path: "core/tlb.sv",
    module: "tlb",
    description: "Translation Lookaside Buffer. Fully-associative (4 entries for ITLB, 16 for DTLB). Each entry stores: VPN (virtual page number), ASID, physical address, permission bits (R/W/X/U), page size (4KB/2MB/1GB for Sv39). Lookup is a parallel tag compare across all entries.",
    instantiatedBy: ["mmu"],
    instantiates: [],
    keySignals: ["vaddr_i", "asid_i", "lu_content_o (PTE)", "lu_hit_o", "update_i (fill from PTW)"],
    category: "MMU & TLB",
    importance: "critical"
  },
  {
    path: "core/ptw.sv",
    module: "ptw",
    description: "Page Table Walker. Hardware state machine that walks the Sv39 page table (3 levels: L2→L1→L0) in memory when a TLB misses. Reads PTEs from DRAM via the D-cache. Handles page fault detection (invalid PTE, permission violations). Updates TLB on success.",
    instantiatedBy: ["mmu"],
    instantiates: [],
    keySignals: ["satp_ppn_i (page table base)", "ptw_active_o", "walking_instr_o", "dcache_req_port_o (reads PTEs)", "pte_o (result)", "page_fault_o"],
    category: "MMU & TLB",
    importance: "critical"
  },

  // ── PRIVILEGED ARCHITECTURE ───────────────────────────────────────────────
  {
    path: "core/csr_regfile.sv",
    module: "csr_regfile",
    description: "RISC-V CSR register file. Implements all M-mode and S-mode CSRs: mstatus/sstatus, mtvec/stvec, mepc/sepc, mcause/scause, mtval/stval, mie/mip, satp, mhartid, minstret, mcycle, fcsr, etc. Handles trap sequences (save PC/cause, switch privilege, output trap vector) and MRET/SRET.",
    instantiatedBy: ["cva6"],
    instantiates: ["trigger_module"],
    keySignals: ["ex_i (exception from commit)", "csr_op_i/wdata_i", "epc_o", "eret_o", "trap_vector_base_o", "priv_lvl_o", "irq_ctrl_o", "flush_o"],
    category: "Privileged Architecture",
    importance: "critical"
  },
  {
    path: "core/commit_stage.sv",
    module: "commit_stage",
    description: "Commit stage. The ONLY module that writes architectural state. Reads scoreboard head entries, checks for exceptions, writes results to the register file (we_gpr_o), drains stores to cache (commit_lsu_o), and handles fence/CSR instructions.",
    instantiatedBy: ["cva6"],
    instantiates: [],
    keySignals: ["commit_instr_i", "commit_drop_i", "waddr_o/wdata_o/we_gpr_o", "exception_o", "commit_lsu_o", "fence_i_o"],
    category: "Privileged Architecture",
    importance: "critical"
  },

  // ── FLOATING POINT ────────────────────────────────────────────────────────
  {
    path: "core/fpu_wrap.sv",
    module: "fpu_wrap",
    description: "Wrapper around the cvfpu (CV-FPU) floating-point unit. Converts CVA6's fu_data_t interface to cvfpu's operand/result format. Handles FMADD/FMSUB (fused multiply-add), FDIV/FSQRT, comparisons, and conversions. Multi-cycle, latency varies by operation.",
    instantiatedBy: ["ex_stage"],
    instantiates: ["fpnew_top (cvfpu)"],
    keySignals: ["fpu_valid_i", "fpu_ready_o", "fu_data_i", "result_o", "fflags_o (FP exception flags)"],
    category: "Floating Point",
    importance: "supporting"
  },

  // ── DEBUG ─────────────────────────────────────────────────────────────────
  {
    path: "core/debug/dm_top.sv",
    module: "dm_top",
    description: "RISC-V Debug Module top level (JTAG interface). Implements the RISC-V external debug specification. Connects to the CPU via the debug_req_i signal and the program buffer (abstract commands). Allows GDB to halt, single-step, and inspect/modify CPU state.",
    instantiatedBy: ["SoC"],
    instantiates: ["dm_csrs", "dm_sba", "dm_mem"],
    keySignals: ["debug_req_o (→ cva6)", "tck_i/tdi_i/tdo_o (JTAG)", "dmactive_o", "dmi_*"],
    category: "Debug",
    importance: "supporting"
  },

  // ── COMMON CELLS (used throughout) ────────────────────────────────────────
  {
    path: "vendor/pulp-platform/common_cells/src/fifo_v3.sv",
    module: "fifo_v3",
    description: "Parameterized synchronous FIFO (from ETH Zurich common_cells). Used for: the fetch queue in the frontend, the LSU request queues, and various other buffering. Supports fall-through mode (data readable same cycle as written).",
    instantiatedBy: ["frontend (instr_queue)", "load_store_unit", "multiple others"],
    instantiates: [],
    keySignals: ["data_i", "push_i", "data_o", "pop_i", "full_o", "empty_o", "usage_o"],
    category: "Common Cells",
    importance: "utility"
  },
  {
    path: "vendor/pulp-platform/common_cells/src/rr_arb_tree.sv",
    module: "rr_arb_tree",
    description: "Round-robin arbiter tree (from common_cells). Used in the cache subsystem and issue stage to arbitrate between multiple requestors. Logarithmic arbitration tree using lzc (leading zero counter).",
    instantiatedBy: ["wt_dcache", "issue_stage"],
    instantiates: ["lzc"],
    keySignals: ["req_i", "gnt_o", "rr (internal round-robin state)"],
    category: "Common Cells",
    importance: "utility"
  },
  {
    path: "vendor/pulp-platform/common_cells/src/lzc.sv",
    module: "lzc",
    description: "Leading/Trailing Zero Counter (from common_cells). Used by the ALU (for CLZ/CTZ instructions), rr_arb_tree (for priority encoding), and the scoreboard (for finding the next free slot). Recursive generate-based implementation.",
    instantiatedBy: ["alu", "rr_arb_tree", "scoreboard"],
    instantiates: [],
    keySignals: ["in_i (input vector)", "cnt_o (count)", "empty_o (no zeros found)"],
    category: "Common Cells",
    importance: "utility"
  },

  // ── PACKAGES & CONFIG ─────────────────────────────────────────────────────
  {
    path: "core/include/ariane_pkg.sv",
    module: "ariane_pkg",
    description: "The main package. Defines: all fu_t/fu_op enums (ALU/BU/LSU/MULT/CSR + 100+ operations), cf_t (control flow types), all derived type aliases, helper functions (is_store(), is_amo(), fd_changes_rd_state(), etc.). Every CVA6 module imports this.",
    instantiatedBy: ["(package — imported by all modules)"],
    instantiates: [],
    keySignals: ["fu_t enum", "fu_op enum", "cf_t enum"],
    category: "Packages & Config",
    importance: "critical"
  },
  {
    path: "core/include/config_pkg.sv",
    module: "config_pkg",
    description: "Configuration parameter package. Defines cva6_cfg_t struct containing all CPU parameters: XLEN (32/64), VLEN, PLEN, NrIssuePorts, NrCommitPorts, NR_SB_ENTRIES, RVC, RVS, RVA, FpPresent, FpgaEn, DebugEn, etc. The single point of CPU configuration.",
    instantiatedBy: ["(package — top-level parameter)"],
    instantiates: [],
    keySignals: ["cva6_cfg_t struct", "XLEN", "NR_SB_ENTRIES", "NrIssuePorts"],
    category: "Packages & Config",
    importance: "top"
  },
  {
    path: "core/include/riscv_pkg.sv",
    module: "riscv_pkg",
    description: "RISC-V ISA encoding package. Defines: opcode enums, funct3/funct7 constants, priv_lvl_t (M/S/U modes), cause codes (exception and interrupt numbers), PTE bit definitions, CSR address constants. The hardware encoding of the RISC-V specification.",
    instantiatedBy: ["(package — imported by decoder, csr_regfile, ptw)"],
    instantiates: [],
    keySignals: ["OpcodeLoad/Store/RegReg/...", "PRIV_LVL_M/S/U", "INSTR_ADDR_MISALIGNED, LOAD_PAGE_FAULT..."],
    category: "Packages & Config",
    importance: "critical"
  }
];

export const getHierarchyByCategory = (): Record<HierarchyCategory, SourceFile[]> => {
  const map = {} as Record<HierarchyCategory, SourceFile[]>;
  for (const f of cva6Hierarchy) {
    if (!map[f.category]) map[f.category] = [];
    map[f.category].push(f);
  }
  return map;
};

export const getFileByModule = (module: string): SourceFile | undefined =>
  cva6Hierarchy.find(f => f.module === module);

export const IMPORTANCE_ORDER: Record<string, number> = {
  top: 0, critical: 1, supporting: 2, utility: 3
};

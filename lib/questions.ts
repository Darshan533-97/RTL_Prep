import { Question } from "./types";

export const questions: Question[] = [
  // ─── LEVEL 1: BEGINNER ───────────────────────────────────────────────────
  {
    id: "l1-q1",
    level: 1,
    topic: "Flip-Flops",
    question:
      "What is the difference between a D flip-flop and a D latch? When would you use each?",
    reference_answer:
      "A D latch is level-sensitive: it passes the D input to Q whenever the enable/clock is high. A D flip-flop is edge-triggered: it samples D only at the rising (or falling) edge of the clock and holds the value until the next edge. In synchronous digital design you almost always use flip-flops because their predictable, instantaneous sampling makes timing analysis tractable. Latches are occasionally used deliberately (e.g., in clock-gating cells or certain pipeline bypass structures) but can cause hold-time violations and are easy to infer accidentally in RTL.",
    explanation:
      "The core distinction is level-sensitive vs edge-triggered behavior. A latch is 'transparent' while enabled — any glitch on D propagates to Q. This makes static timing analysis (STA) harder because you now have a combinational path through the latch that depends on when the enable is asserted.\n\nFlip-flops define clear launch and capture edges, giving synthesis and STA tools clean constraints to work with. This is why RTL style guides universally ban unintentional latch inference (missing else or case default in combinational always blocks).\n\nIn real CPU designs like CVA6, all architectural state (PC, register file, CSRs) is held in edge-triggered flip-flops. Latches appear only in carefully reviewed physical design cells.",
    resources: [
      { title: "CVA6 Register File", url: "https://github.com/openhwgroup/cva6/blob/master/core/register_file_ff.sv", type: "repo" },
      { title: "Patterson & Hennessy — Appendix C", url: "https://www.elsevier.com/books/computer-organization-and-design-risc-v-edition/patterson/978-0-12-820331-6", type: "book" },
    ],
  },
  {
    id: "l1-q2",
    level: 1,
    topic: "Combinational vs Sequential Logic",
    question:
      "How does a simulator and synthesis tool distinguish between combinational and sequential always blocks in SystemVerilog? What are the rules?",
    reference_answer:
      "In SystemVerilog, always_comb is combinational: the tool infers no storage and re-evaluates whenever any signal in the block changes. always_ff @(posedge clk) is sequential: flip-flops are inferred. The legacy always @(*) is combinational if no signals are assigned with non-blocking assignments (<=) and the sensitivity list covers all inputs, but it is error-prone. Key rules: (1) Use non-blocking assignments (<=) in always_ff, blocking (=) in always_comb. (2) Every output of always_comb must be assigned in every code path — a missing else or case default infers a latch in always, and is a compile error in always_comb. (3) Do not mix blocking and non-blocking in the same always block.",
    explanation:
      "Synthesis tools infer hardware by pattern-matching the RTL. The assignment type (blocking vs non-blocking) and sensitivity list are the primary signals. Non-blocking assignments create flip-flop behavior because they model the 'schedule update for end of time step' semantics of FFs.\n\nThe always_comb/always_ff/always_latch keywords were introduced in SystemVerilog precisely to eliminate ambiguity and give tools an explicit declaration of intent, enabling better lint and synthesis error reporting.\n\nA classic bug in Verilog: forgetting the else in a combinational always block creates a latch — the tool preserves the old value when the condition is false, which is sequential behavior. This is a common RTL interview trap question.",
    resources: [
      { title: "PicoRV32 RTL (clean Verilog style reference)", url: "https://github.com/YosysHQ/picorv32/blob/master/picorv32.v", type: "repo" },
      { title: "Weste & Harris CMOS VLSI Design Ch. 5", url: "https://www.pearson.com/en-us/subject-catalog/p/cmos-vlsi-design-a-circuits-and-systems-perspective/P200000003196", type: "book" },
    ],
  },
  {
    id: "l1-q3",
    level: 1,
    topic: "Setup & Hold Time",
    question:
      "Define setup time and hold time for a flip-flop. What happens if each is violated? How does this relate to max operating frequency?",
    reference_answer:
      "Setup time (Tsu) is the minimum time data must be stable before the clock edge. Hold time (Th) is the minimum time data must remain stable after the clock edge. Setup violation: the FF samples metastable or wrong data — circuit malfunction or metastability. Hold violation: the FF samples the next cycle's data before it should — also malfunction. Maximum frequency: Fmax = 1 / (Tclk_to_q + Tcomb_max + Tsu + Tskew). Reducing combinational logic depth or using faster cells increases Fmax. Hold violations are fixed by adding buffers (delay), not by changing the clock period — they are frequency-independent.",
    explanation:
      "Setup and hold are the fundamental constraints that make synchronous design work. STA tools (Primetime, Tempus) check every flip-flop pair: launch FF → combinational path → capture FF, and verify Tsetup and Thold are met across all PVT corners.\n\nHold violations are particularly nasty in silicon: they cannot be fixed by slowing the clock. They usually show up when adjacent FFs are very fast with little combinational logic between them (e.g., direct connections). Signoff requires hold fixing via buffer insertion in physical design.\n\nMetastability is the failure mode when setup/hold are violated — the output of the FF enters an intermediate voltage state that resolves randomly to 0 or 1 after an indeterminate time. MTBF (mean time between failures) calculations quantify this risk in async interfaces.",
    resources: [
      { title: "Weste & Harris CMOS VLSI Design — Timing", url: "https://www.pearson.com/en-us/subject-catalog/p/cmos-vlsi-design-a-circuits-and-systems-perspective/P200000003196", type: "book" },
    ],
  },
  {
    id: "l1-q4",
    level: 1,
    topic: "Basic Verilog",
    question:
      "Write synthesizable RTL for a 4-bit synchronous up-counter with active-high synchronous reset.",
    reference_answer:
      "```systemverilog\nmodule counter4 (\n  input  logic       clk,\n  input  logic       rst,   // synchronous active-high\n  output logic [3:0] count\n);\n  always_ff @(posedge clk) begin\n    if (rst)\n      count <= 4'b0;\n    else\n      count <= count + 1'b1;\n  end\nendmodule\n```\nKey points: always_ff for flip-flop inference, non-blocking assignment (<=), synchronous reset inside the clocked block (not in sensitivity list), 4-bit width wraps naturally at 15→0.",
    explanation:
      "This is the 'hello world' of RTL. The key decisions: synchronous vs asynchronous reset (synchronous is preferred in most modern ASIC flows — it avoids reset-domain issues and is easier to time), non-blocking assignments to avoid race conditions, and using always_ff to make intent explicit.\n\nAsynchronous reset would be: always_ff @(posedge clk or posedge rst) — note rst in sensitivity list. This is common in FPGA designs and some ASIC flows but requires careful reset-domain crossing treatment.\n\nIn production CPU RTL like CVA6, counters appear in performance monitoring units (PMU), timeout watchdogs, and scoreboard tracking logic.",
    resources: [
      { title: "CVA6 Performance Counters", url: "https://github.com/openhwgroup/cva6/blob/master/core/csr_regfile.sv", type: "repo" },
    ],
  },
  {
    id: "l1-q5",
    level: 1,
    topic: "Clock Domains",
    question:
      "What is a clock domain? Why is it dangerous to pass a signal directly from one clock domain to another?",
    reference_answer:
      "A clock domain is a set of flip-flops driven by the same clock signal (same source, frequency, and phase). Passing a signal directly between domains is dangerous because the receiving FF may sample the signal during its setup/hold window, causing metastability. Even if no metastability occurs, without synchronization the receiving domain has no guarantee of when the data arrives relative to its own clock, leading to functional errors. The standard fix is a synchronizer (2-FF for single-bit) or a handshake/FIFO for multi-bit data.",
    explanation:
      "Clock domain crossing (CDC) is one of the most common sources of silicon bugs. The 2-FF synchronizer works by giving the metastable output of the first FF enough time (one full clock cycle) to resolve before the second FF samples it. The MTBF of the synchronizer depends on the clock frequency and FF characteristics.\n\nFor multi-bit signals, you cannot use individual synchronizers on each bit — the bits may be captured in different cycles, giving a torn read. Solutions: Gray-code encoding (only 1 bit changes per transition), async FIFOs (with Gray-coded pointers), or full handshake protocols.\n\nCDC verification requires dedicated tools (Meridian CDC, Questa CDC) because standard simulation and STA don't catch these bugs reliably.",
    resources: [
      { title: "VexRiscv CDC handling", url: "https://github.com/SpinalHDL/VexRiscv", type: "repo" },
    ],
  },
  {
    id: "l1-q6",
    level: 1,
    topic: "FSM Design",
    question:
      "Design a 2-state FSM in SystemVerilog that detects the sequence '101' on a serial input stream.",
    reference_answer:
      "```systemverilog\ntypedef enum logic [1:0] {IDLE, GOT1, GOT10} state_t;\nstate_t state, next;\nalways_ff @(posedge clk) state <= rst ? IDLE : next;\nalways_comb begin\n  next = state; detect = 0;\n  case (state)\n    IDLE:  next = in ? GOT1   : IDLE;\n    GOT1:  next = in ? GOT1   : GOT10;\n    GOT10: begin detect = in; next = in ? GOT1 : IDLE; end\n  endcase\nend\n```\nNeeds 3 states (not 2). Separate next-state logic (always_comb) from state register (always_ff). Output detect is Mealy (depends on current state + input).",
    explanation:
      "The standard RTL FSM template separates three concerns: (1) state register — always_ff, (2) next-state logic — always_comb, (3) output logic — always_comb. This three-always style makes synthesis and review straightforward.\n\nMealy vs Moore: Mealy outputs depend on state + inputs (faster response, fewer states), Moore outputs depend only on state (easier to time, no glitches). Most CPU control logic uses Mealy machines implicitly.\n\nUsing typedef enum with named states instead of raw parameters makes the design self-documenting and enables waveform tools to display state names.",
    resources: [
      { title: "PicoRV32 FSM-style control", url: "https://github.com/YosysHQ/picorv32/blob/master/picorv32.v", type: "repo" },
    ],
  },
  {
    id: "l1-q7",
    level: 1,
    topic: "Blocking vs Non-Blocking",
    question:
      "What is the difference between blocking (=) and non-blocking (<=) assignments? What bug occurs if you use blocking assignments in a clocked always block?",
    reference_answer:
      "Blocking (=): executes immediately and sequentially within the time step — like a C assignment. Non-blocking (<=): schedules the right-hand side to be evaluated now, but the update happens at the end of the time step. In a clocked always_ff block, using blocking assignments creates race conditions: if two FFs exchange values (swap), blocking makes the second assignment see the already-updated value of the first, collapsing two registers into one. Non-blocking guarantees both FFs sample the pre-clock-edge values. Rule: always use <= in always_ff, = in always_comb.",
    explanation:
      "The classic demonstration is a shift register: if you write 'a = b; b = a;' with blocking in always_ff, both a and b get the value of b — the old value of a is lost. With non-blocking, both right-hand sides are evaluated before any left-hand side is updated, correctly swapping the values.\n\nThis is not just a simulation artifact — synthesis tools use the blocking/non-blocking distinction as a hint for hardware inference. Mixing them in the same always block can lead to synthesis-simulation mismatch, which is extremely hard to debug.\n\nVerilog style guides (e.g., Cliff Cummings' papers) are the canonical reference on this topic and are worth reading for any RTL interview.",
    resources: [
      { title: "Cliff Cummings — Nonblocking Assignments in Verilog", url: "http://www.sunburst-design.com/papers/CummingsSNUG2000SJ_NBA.pdf", type: "paper" },
    ],
  },
  {
    id: "l1-q8",
    level: 1,
    topic: "Parameters & Generate",
    question:
      "How do you make a parameterized N-bit register in SystemVerilog? What is the generate construct used for?",
    reference_answer:
      "```systemverilog\nmodule reg_n #(parameter int N = 8) (\n  input  logic         clk, rst,\n  input  logic [N-1:0] d,\n  output logic [N-1:0] q\n);\n  always_ff @(posedge clk)\n    q <= rst ? '0 : d;\nendmodule\n```\nGenerate is used to conditionally instantiate or replicate hardware based on parameters at elaboration time — e.g., generating N instances of a module, or conditionally including a feature. It runs at compile/elaboration time, not simulation time.",
    explanation:
      "Parameterization is essential for reusable RTL IP. A single parameterized FIFO, adder, or arbiter can be instantiated at multiple widths without code duplication. Parameters are resolved at elaboration time — the synthesized netlist will have concrete widths.\n\nGenerate statements are powerful but can obfuscate designs if overused. Common uses: generating arrays of module instances (e.g., N cache ways), conditionally compiling ECC logic, or selecting between different implementations based on a parameter.\n\nThe '0 syntax in SystemVerilog is a width-inferred zero — cleaner than writing {N{1'b0}} and avoids width mismatch warnings.",
    resources: [
      { title: "CVA6 parameterized cache", url: "https://github.com/openhwgroup/cva6/blob/master/core/cache_subsystem/wt_dcache.sv", type: "repo" },
    ],
  },

  // ─── LEVEL 2: INTERMEDIATE ───────────────────────────────────────────────
  {
    id: "l2-q1",
    level: 2,
    topic: "Pipeline Hazards",
    question:
      "Describe the three types of pipeline hazards. How does forwarding (bypassing) resolve data hazards, and when is it insufficient?",
    reference_answer:
      "Structural hazard: two instructions need the same hardware resource simultaneously (e.g., single-port memory for IF and MEM stages). Data hazard: an instruction needs a result that hasn't been written back yet — RAW (read-after-write), WAW, WAR. Control hazard: branch/jump changes PC before fetch of subsequent instructions completes. Forwarding resolves RAW hazards by routing the result from EX/MEM/WB pipeline registers directly to the EX stage input, bypassing the register file. Forwarding is insufficient for load-use hazards: a load result is not available until end of MEM stage, so the immediately following instruction that needs it must stall one cycle (load-use hazard stall).",
    explanation:
      "Pipeline hazards are the central challenge of pipelined CPU design. A 5-stage RISC pipeline (IF-ID-EX-MEM-WB) has well-defined hazard scenarios that every CPU architect must know cold.\n\nForwarding logic is a network of muxes at the ALU inputs. The hazard detection unit compares the source registers of the instruction in ID/EX against the destination registers of instructions in EX/MEM and MEM/WB, selecting the forwarded value when a match is found.\n\nLoad-use stalls are unavoidable in a simple 5-stage pipeline without speculative execution. The compiler can schedule a useful instruction in the load delay slot to hide the stall. Out-of-order processors eliminate most stalls by dynamically reordering instructions.",
    resources: [
      { title: "CVA6 5-stage pipeline", url: "https://github.com/openhwgroup/cva6/blob/master/core/ex_stage.sv", type: "repo" },
      { title: "Patterson & Hennessy Ch. 4", url: "https://www.elsevier.com/books/computer-organization-and-design-risc-v-edition/patterson/978-0-12-820331-6", type: "book" },
    ],
  },
  {
    id: "l2-q2",
    level: 2,
    topic: "Clock Domain Crossing",
    question:
      "Why can't you use a simple 2-FF synchronizer for multi-bit data crossing clock domains? What are the correct solutions?",
    reference_answer:
      "A 2-FF synchronizer on each individual bit of a multi-bit bus is incorrect because different bits may resolve their metastability in different clock cycles — the receiver can sample a torn value where some bits are from the 'old' data and some from the 'new' data. Correct solutions: (1) Async FIFO with Gray-coded read/write pointers — only the pointer (1-bit change per increment) crosses the domain via synchronizers; (2) Gray code encoding — if data is a counter that increments by 1, Gray encode it before crossing; (3) Handshake protocol — sender asserts req, receiver synchronizes it, asserts ack, sender synchronizes ack before sending next data; (4) Qualified sampling — sample all bits only when a synchronized 'valid' flag is asserted and data is known stable.",
    explanation:
      "The torn-read problem is subtle and only manifests rarely in simulation but reliably in silicon at volume. Async FIFOs are the standard solution for streaming data between clock domains.\n\nThe async FIFO design (Clifford Cummings' paper is the definitive reference) uses separate read and write pointers, each in their own clock domain. The pointers are Gray-coded before being synchronized to the other domain to compute full/empty flags. This is one of the most important RTL design patterns to know for interviews.\n\nIn CVA6, the cache miss interface between the core (CPU clock) and the memory controller (may run at different rate) uses handshake protocols for control signals and registered data paths.",
    resources: [
      { title: "Cliff Cummings — Simulation and Synthesis Techniques for Async FIFOs", url: "http://www.sunburst-design.com/papers/CummingsSNUG2002SJ_FIFO1.pdf", type: "paper" },
      { title: "CVA6 Cache/AXI interface", url: "https://github.com/openhwgroup/cva6/blob/master/core/cache_subsystem/axi_adapter.sv", type: "repo" },
    ],
  },
  {
    id: "l2-q3",
    level: 2,
    topic: "Cache Design",
    question:
      "Compare direct-mapped, set-associative, and fully associative caches. What is the tradeoff between associativity and hardware cost?",
    reference_answer:
      "Direct-mapped: each memory address maps to exactly one cache set. Fast (no comparison needed beyond tag match), cheap, but suffers conflict misses when two hot addresses map to the same set. N-way set-associative: each set has N ways; the cache checks all N tags in parallel. Reduces conflict misses, hardware cost scales with N (N comparators, N-to-1 mux, replacement logic). Fully associative: any line can go anywhere; best hit rate, but requires a comparator per cache line — only practical for small structures (TLBs, victim caches). The tradeoff: more associativity → fewer conflict misses → lower miss rate, but higher area, power, and access latency (more muxing). Most L1 caches are 4–8 way; L2/L3 are 8–16 way.",
    explanation:
      "Cache design is a major topic in CPU microarchitecture interviews. You need to know the address breakdown (tag | index | offset), how replacement policies work (LRU, PLRU, random), and the implications of write policies (write-through vs write-back, write-allocate vs no-write-allocate).\n\nConflict misses are the key motivation for associativity. A famous example: two arrays whose sizes are a power-of-2 multiple of the cache size will thrash in a direct-mapped cache, evicting each other every access. Even 2-way associativity nearly eliminates this.\n\nLRU replacement is optimal for many access patterns but expensive to implement exactly for high associativity (need to track order of N ways). Pseudo-LRU (PLRU) uses a binary tree of bits to approximate LRU at much lower cost and is standard in real designs.",
    resources: [
      { title: "CVA6 D-Cache implementation", url: "https://github.com/openhwgroup/cva6/blob/master/core/cache_subsystem/wt_dcache.sv", type: "repo" },
      { title: "Patterson & Hennessy Ch. 5 — Memory Hierarchy", url: "https://www.elsevier.com/books/computer-organization-and-design-risc-v-edition/patterson/978-0-12-820331-6", type: "book" },
    ],
  },
  {
    id: "l2-q4",
    level: 2,
    topic: "Timing Constraints",
    question:
      "What is a false path and a multicycle path in STA? Give a concrete example of each and explain when to declare them.",
    reference_answer:
      "False path: a timing path that exists in the netlist but can never be sensitized in real operation. Example: a mux that selects between two clock domains — the path through the off-path input will never carry live data when the mux is selected for the other input. Declaring it false (set_false_path) removes it from STA, preventing over-constraining. Multicycle path: a path that by design takes more than one clock cycle to complete. Example: a low-power divider that is only read every 4 cycles — you can set_multicycle_path 4 to relax the timing constraint. Misuse: declaring too many false/multicycle paths can mask real timing problems. Must be justified by microarchitectural intent.",
    explanation:
      "STA constraint quality is as important as RTL quality. Over-constraining wastes area and power (synthesis over-buffers). Under-constraining (wrong false/multicycle paths) ships silicon bugs.\n\nFalse paths commonly appear at: reset logic (synchronous reset trees don't need to meet timing in the same way), test logic (scan chains), and clock domain boundaries (already handled by CDC analysis). Multicycle paths appear in low-bandwidth interfaces, iterative datapaths, and anything explicitly designed to operate over multiple cycles.\n\nIn real tapeouts, the constraints file (SDC) is reviewed as carefully as the RTL. A wrong constraint in the SDC is as dangerous as a bug in the RTL.",
    resources: [
      { title: "Weste & Harris — Static Timing Analysis", url: "https://www.pearson.com/en-us/subject-catalog/p/cmos-vlsi-design-a-circuits-and-systems-perspective/P200000003196", type: "book" },
    ],
  },
  {
    id: "l2-q5",
    level: 2,
    topic: "AXI Protocol",
    question:
      "Describe the AXI4 channel structure. Why does AXI separate the address and data channels? What is the purpose of the handshake (valid/ready)?",
    reference_answer:
      "AXI4 has 5 channels: Write Address (AW), Write Data (W), Write Response (B), Read Address (AR), Read Data (R). Separating address and data channels allows the master to issue multiple outstanding transactions (pipelining) — the slave can accept a new address while still processing a previous one. The valid/ready handshake is a flow-control mechanism: the sender asserts valid when data is available; the receiver asserts ready when it can accept. A transfer occurs only when both are high on the same clock edge. This decouples producer and consumer speeds without requiring a FIFO of fixed depth.",
    explanation:
      "AXI is the de facto standard interconnect for ARM and RISC-V SoC designs. Understanding it is mandatory for any RTL role working on CPU subsystems, peripherals, or memory controllers.\n\nThe outstanding transaction capability (via AXI IDs) is what enables high-bandwidth memory access — a CPU can issue 16 read requests before getting the first response. The ID tags allow out-of-order responses to be correctly routed.\n\nAXI4-Lite is a simplified subset (no bursts, no out-of-order) used for low-bandwidth register interfaces. AXI4-Stream drops address channels entirely for pure streaming data (useful for DSP, DMA engines).\n\nCVA6's cache subsystem interfaces to memory via AXI4, and the adapter RTL is an excellent study of real AXI master implementation.",
    resources: [
      { title: "CVA6 AXI adapter", url: "https://github.com/openhwgroup/cva6/blob/master/core/cache_subsystem/axi_adapter.sv", type: "repo" },
      { title: "ARM AXI4 Specification", url: "https://developer.arm.com/documentation/ihi0022/latest/", type: "spec" },
    ],
  },
  {
    id: "l2-q6",
    level: 2,
    topic: "Reset Strategy",
    question:
      "Compare synchronous and asynchronous reset strategies for ASIC design. What are the tradeoffs? What is a reset synchronizer and why is it needed?",
    reference_answer:
      "Synchronous reset: reset is sampled only on the clock edge. Pros: no special timing constraints (reset path is just like data), immune to glitches, plays well with scan. Cons: clock must be running during reset assertion; reset may be delayed up to one cycle. Asynchronous reset: FF resets immediately on assertion regardless of clock. Pros: works without clock, faster response. Cons: deassertion is asynchronous — if the reset deasserts near a clock edge, different FFs may come out of reset on different cycles (reset-domain fanout skew), causing functional failures. A reset synchronizer (2-FF synchronizer on the reset deassertion path) ensures synchronous deassertion while keeping asynchronous assertion, combining the benefits of both.",
    explanation:
      "Reset strategy is a real sign-off concern in ASIC design. Asynchronous reset assertion is often desired (you want the chip to reset even if the clock is dead), but synchronous deassertion is essential for correct operation.\n\nThe standard reset synchronizer: two FFs with asynchronous reset, connected in series, with the synchronized output driving the rest of the chip. When reset is asserted, both FFs immediately go low. When reset deasserts, the deassertion propagates through the two-stage synchronizer, ensuring all downstream logic sees it on the same clock edge.\n\nIn complex SoCs with multiple clock domains, each domain needs its own reset synchronizer for its local clock.",
    resources: [
      { title: "CVA6 Reset handling", url: "https://github.com/openhwgroup/cva6", type: "repo" },
    ],
  },
  {
    id: "l2-q7",
    level: 2,
    topic: "FIFO Design",
    question:
      "Design a synchronous FIFO with parameterizable depth and width. What logic generates the full and empty flags?",
    reference_answer:
      "Use a circular buffer with read and write pointers, each one bit wider than needed to index the buffer (extra bit tracks wrap-around). Empty when rd_ptr == wr_ptr (all bits equal). Full when pointers differ only in MSB (wr has wrapped, rd hasn't). RTL sketch:\n```\nlogic [ADDR_W:0] wr_ptr, rd_ptr;\nassign empty = (wr_ptr == rd_ptr);\nassign full  = (wr_ptr[ADDR_W] != rd_ptr[ADDR_W]) && (wr_ptr[ADDR_W-1:0] == rd_ptr[ADDR_W-1:0]);\n```\nAlmost-full and almost-empty flags use (wr_ptr - rd_ptr) comparisons for programmable thresholds.",
    explanation:
      "The extra pointer bit trick is the canonical way to distinguish full from empty without wasting one slot or using a separate counter. It works because two pointers are equal only if they've wrapped the same number of times AND point to the same location.\n\nCommon interview follow-up: how do you handle simultaneous read and write? Answer: if not full, write; if not empty, read; both can happen in the same cycle (first-word fall-through FIFOs also need a bypass path for the empty→non-empty transition).\n\nFor async FIFOs, the pointers are Gray-coded before crossing clock domains — the extra-bit technique still applies but each pointer is synchronized independently.",
    resources: [
      { title: "Cliff Cummings FIFO paper", url: "http://www.sunburst-design.com/papers/CummingsSNUG2002SJ_FIFO1.pdf", type: "paper" },
    ],
  },
  {
    id: "l2-q8",
    level: 2,
    topic: "Power Reduction",
    question:
      "What is clock gating? How is it implemented in RTL and why must it be done carefully?",
    reference_answer:
      "Clock gating disables the clock to flip-flops whose values won't change, eliminating switching power in those FFs and downstream combinational logic. RTL style: instead of if (enable) q <= d; (which still clocks the FF), use an integrated clock gating cell (ICG): the enable is ANDed with the clock in a level-sensitive latch + AND gate structure that prevents glitches on the gated clock. Must be done carefully because: (1) glitches on the enable can corrupt the gated clock if not using a proper ICG cell; (2) the enable must be stable during the clock high phase; (3) gating at too fine a granularity adds ICG area overhead; (4) DFT (design for test) requires clock gating cells to be scan-testable.",
    explanation:
      "Dynamic power = C × V² × f × α where α is activity factor. Clock gating reduces α for idle register banks — in a CPU, large structures like the register file, instruction queue, or FPU can be clock-gated when not in use, saving 20-40% dynamic power.\n\nThe ICG cell is a standard cell in every cell library. It consists of a negative-level-sensitive latch (samples enable on clock low) feeding an AND gate. The latch prevents enable glitches from propagating to the gated clock output. RTL should infer ICGs — most synthesis tools will convert always_ff with enable conditions to ICG cells automatically if the flow is set up correctly.\n\nMulti-level clock gating (gating at the block, sub-block, and register level) is standard practice in modern SoC design.",
    resources: [
      { title: "CVA6 clock gating examples", url: "https://github.com/openhwgroup/cva6", type: "repo" },
    ],
  },

  // ─── LEVEL 3: ADVANCED ───────────────────────────────────────────────────
  {
    id: "l3-q1",
    level: 3,
    topic: "Out-of-Order Execution",
    question:
      "Explain the Tomasulo algorithm. What problem does it solve and what are its key hardware structures?",
    reference_answer:
      "Tomasulo's algorithm enables out-of-order execution by dynamically resolving data hazards using register renaming and reservation stations. It solves WAW and WAR hazards (false dependencies) by renaming architectural registers to physical registers, and RAW hazards by allowing instructions to execute as soon as their operands are ready rather than in-order. Key structures: (1) Reservation stations — hold instructions waiting for operands, tag-based operand tracking; (2) Common Data Bus (CDB) — broadcasts results to all reservation stations simultaneously; (3) Register alias table (RAT) — maps architectural registers to physical registers or reservation station tags; (4) Reorder buffer (ROB) — added by Tomasulo+ROB (modern variant) to enable precise exceptions and in-order retirement.",
    explanation:
      "The original Tomasulo algorithm (IBM 360/91, 1967) didn't have a ROB and thus couldn't handle precise exceptions — results were written directly to the register file when ready. Modern OoO processors (including every x86 since P6 and most ARMv8 designs) use the Tomasulo+ROB variant.\n\nThe ROB is a circular buffer that holds instructions in program order. Instructions are allocated an ROB entry at dispatch, execute out of order, write results to the ROB, and commit in order from the head. This enables precise exceptions (drain the pipeline to the faulting instruction) and branch misprediction recovery (squash all ROB entries after the branch).\n\nPhysical register files decouple the architectural register count (32 for RISC-V) from the physical register count (128-256 in modern designs), enabling the aggressive renaming needed for high IPC.",
    resources: [
      { title: "CVA6 Issue stage / Scoreboard", url: "https://github.com/openhwgroup/cva6/blob/master/core/issue_stage.sv", type: "repo" },
      { title: "Patterson & Hennessy Appendix C — OoO", url: "https://www.elsevier.com/books/computer-organization-and-design-risc-v-edition/patterson/978-0-12-820331-6", type: "book" },
    ],
  },
  {
    id: "l3-q2",
    level: 3,
    topic: "Branch Prediction",
    question:
      "Compare bimodal, two-level adaptive (gshare), and TAGE branch predictors. What is the key insight each adds over the previous?",
    reference_answer:
      "Bimodal: 2-bit saturating counter per PC (indexed by PC bits). Predicts based only on the branch's own history. Key insight: branches are often biased (mostly taken or mostly not taken). Gshare: XOR of PC with global branch history register indexes the counter table. Key insight: branches are correlated with recent branch outcomes — a loop-exit branch is more predictable knowing the loop counter branch was recently taken N times. TAGE (Tagged Geometric History Length): multiple tables with geometrically increasing history lengths, tagged with partial PC+history hash. Uses the longest matching table as the primary predictor, shorter tables as fallback. Key insight: different branches need different history lengths; a single history length is a compromise.",
    explanation:
      "Branch prediction is the dominant source of frontend performance in modern superscalar CPUs. A misprediction costs 15-20 cycles in a deep pipeline (the full frontend refill time).\n\nState-of-the-art predictors (TAGE-SC-L, used in BOOM and studied for RISC-V) achieve >95% accuracy on SPEC benchmarks. The SC (statistical corrector) and L (loop predictor) components handle cases where TAGE alone is wrong.\n\nFor RISC-V open-source CPUs: BOOM (Berkeley Out-of-Order Machine) implements TAGE and is the most complete open-source OoO RISC-V core for studying advanced microarchitecture. CVA6 uses a simpler 2-bit predictor with a BTB (branch target buffer).",
    resources: [
      { title: "BOOM RISC-V OoO Core", url: "https://github.com/riscv-boom/riscv-boom", type: "repo" },
      { title: "CVA6 Branch Prediction", url: "https://github.com/openhwgroup/cva6/blob/master/core/frontend/bht.sv", type: "repo" },
    ],
  },
  {
    id: "l3-q3",
    level: 3,
    topic: "Memory Consistency",
    question:
      "What is memory consistency? Compare Sequential Consistency (SC) with Total Store Order (TSO). Why do real CPUs not implement SC?",
    reference_answer:
      "Memory consistency defines the order in which memory operations from multiple processors appear to each other. Sequential Consistency (SC): all operations appear to execute in some total order consistent with each processor's program order — the intuitive model. TSO (x86): stores can be buffered in a store buffer and become visible to other processors later, but a processor sees its own stores immediately (store-to-load forwarding). TSO allows write → read reordering. Real CPUs don't implement SC because store buffers are essential for performance — stalling every store until it's globally visible (cache coherence write) would serialize execution and eliminate most of the benefit of OoO. TSO is the weakest model x86 implements; ARM and RISC-V use even weaker models (allowing more reorderings) but require explicit memory fence instructions.",
    explanation:
      "Memory consistency is distinct from cache coherence. Coherence ensures all processors eventually agree on the value of a single address. Consistency defines the ordering guarantees across different addresses.\n\nThe RISC-V memory model (RVWMO — RISC-V Weak Memory Order) is documented in the ISA spec. Programmers use FENCE instructions to enforce ordering when needed. The Linux kernel, for example, uses FENCE.I for instruction cache coherence after JIT compilation.\n\nThis topic is critical for anyone designing memory subsystems, cache coherence protocols, or working on the interface between CPU and memory controller. It also appears in questions about lock-free data structures and concurrent programming correctness.",
    resources: [
      { title: "RISC-V ISA Specification — Memory Model", url: "https://riscv.org/technical/specifications/", type: "spec" },
      { title: "CVA6 Store Buffer", url: "https://github.com/openhwgroup/cva6/blob/master/core/ex_stage.sv", type: "repo" },
    ],
  },
  {
    id: "l3-q4",
    level: 3,
    topic: "Cache Coherence",
    question:
      "Explain the MESI cache coherence protocol. What transitions occur when a core reads a cache line that another core has in Modified state?",
    reference_answer:
      "MESI states: Modified (dirty, exclusive), Exclusive (clean, exclusive), Shared (clean, may be in other caches), Invalid. Read by Core B of a line in Core A's Modified state: (1) Core B issues a read miss (BusRd); (2) The interconnect/snoop controller detects Core A has the line in M state; (3) Core A writes back the line to memory (or forwards directly to Core B via cache-to-cache transfer); (4) Core A transitions to Invalid or Shared; (5) Core B receives the line and transitions to Shared; (6) Memory is updated (or the line is forwarded). The key insight: the modified core must intervene because memory is stale — only the modified cache has the correct data.",
    explanation:
      "MESI (and extensions: MOESI with Owned state for direct cache-to-cache transfer without memory writeback, MESIF with Forward state) is the foundation of all modern multi-core cache coherence.\n\nDirectory-based coherence scales better than snooping for large core counts (snooping broadcasts to all caches — doesn't scale beyond ~16 cores). In directory coherence, a directory tracks which caches have each line, and only those caches are messaged on a miss.\n\nFor RISC-V multi-core SoCs, the standard open-source coherence interconnect is OpenPiton or TileLink (used in BOOM/Chipyard). Understanding how coherence traffic affects bandwidth and latency is critical for multi-core CPU design.",
    resources: [
      { title: "BOOM/Chipyard TileLink coherence", url: "https://github.com/chipsalliance/rocket-chip", type: "repo" },
      { title: "Patterson & Hennessy Ch. 5 — Multiprocessors", url: "https://www.elsevier.com/books/computer-organization-and-design-risc-v-edition/patterson/978-0-12-820331-6", type: "book" },
    ],
  },
  {
    id: "l3-q5",
    level: 3,
    topic: "Superscalar Design",
    question:
      "What are the key bottlenecks in scaling a superscalar processor from 2-wide to 8-wide? Why don't we just keep adding execution units?",
    reference_answer:
      "Key bottlenecks: (1) Instruction fetch bandwidth — need to fetch 8 instructions/cycle, requiring wider I-cache access and branch prediction for multiple branches per fetch group; (2) Decode complexity — identifying 8 instruction types in parallel, variable-length encoding (x86) is especially hard; (3) Register rename — allocate 8 ROB entries, 8 physical registers, update RAT for 8 instructions atomically per cycle; (4) Dispatch/wakeup — wakeup logic (which instructions have all operands ready) is O(N²) comparators for N reservation station entries; (5) Commit — retire up to 8 in-order instructions per cycle; (6) Register file ports — 8 execution units × 2 read ports + 1 write port each = 24 read, 8 write ports; register files don't scale well past 8-16 ports. The fundamental limit: ILP (instruction-level parallelism) in real code is rarely sustained above 3-4 instructions/cycle on typical workloads.",
    explanation:
      "The wakeup/select logic is the canonical scaling challenge. Each cycle, for every reservation station entry, you must check if all operand tags match any of the N execution unit result buses — that's O(RS_size × N) comparators, and the critical path grows with both dimensions.\n\nThe Pentium 4 (Netburst) attempted very deep pipelining (31 stages) to hit high clock frequency — it ran at 3.8GHz but had poor IPC, showing that frequency alone doesn't win. The Core architecture returned to shorter pipelines with higher IPC.\n\nModern x86 (Intel Golden Cove, AMD Zen 4) are ~6-wide decode but achieve ~4 IPC on real workloads. RISC-V designs like BOOM are 2-4 wide. Beyond 4-wide, thread-level parallelism (SMT, multi-core) is more efficient than wider superscalar.",
    resources: [
      { title: "BOOM superscalar RISC-V", url: "https://github.com/riscv-boom/riscv-boom", type: "repo" },
    ],
  },
  {
    id: "l3-q6",
    level: 3,
    topic: "Physical Design Awareness",
    question:
      "What is timing closure and why is it the RTL designer's problem, not just the physical design team's problem?",
    reference_answer:
      "Timing closure is the process of ensuring all paths in the design meet setup and hold timing at the target frequency and PVT corners after place-and-route. It's the RTL designer's problem because: (1) The critical paths are determined by RTL structure — a long combinational chain (adder tree, wide mux, deep logic) will fail timing regardless of physical optimization; (2) Retiming (moving registers across combinational logic) can help but has limits; (3) Fixing timing at the P&R stage by adding buffers increases area and power; (4) Some paths can only be fixed by RTL restructuring — breaking long paths into pipeline stages, changing encodings, or restructuring arithmetic. RTL designers must write with timing in mind: keep combinational depth under ~20-24 FO4 delays, avoid wide priority encoders in critical paths, and be aware of synthesis tool limitations.",
    explanation:
      "The FO4 (fanout-of-4) delay is a technology-independent metric: one FO4 delay is the delay of an inverter driving 4 identical inverters. A typical clock cycle budget is 15-20 FO4 delays. Complex operations like a 64-bit adder (~8-10 FO4 with carry-lookahead) or a large mux tree can consume most of a cycle's budget.\n\nTiming-aware RTL habits: (1) Register outputs of long critical paths; (2) Use one-hot encoding for wide case statements in critical paths; (3) Avoid read-modify-write patterns on large structures in one cycle; (4) Know your target frequency and process node — 1GHz in 28nm is much easier than 3GHz in the same node.\n\nIn tapeout schedules, timing closure is often the last-mile problem that delays tapeout by weeks. RTL designers who understand physical design are invaluable.",
    resources: [
      { title: "Weste & Harris — Design for Performance", url: "https://www.pearson.com/en-us/subject-catalog/p/cmos-vlsi-design-a-circuits-and-systems-perspective/P200000003196", type: "book" },
    ],
  },
  {
    id: "l3-q7",
    level: 3,
    topic: "Verification",
    question:
      "What is functional coverage and how does it differ from code coverage? Why is 100% code coverage insufficient to declare a design correct?",
    reference_answer:
      "Code coverage measures which lines, branches, and expressions in the RTL were exercised during simulation — it is structural. Functional coverage measures whether the design has been exercised in all architecturally meaningful scenarios — it is semantic. 100% code coverage is insufficient because: (1) You can cover every line without ever testing corner cases (e.g., a cache full/empty boundary, a specific FIFO wrap condition, an interrupt during a store); (2) Code coverage doesn't know what the design is supposed to do — it only knows what code was reached; (3) Missing functionality (unimplemented features) has no code to cover. Functional coverage is defined by the verification engineer in covergroups that capture important conditions: all combinations of cache hit/miss × load/store × privilege level, for example.",
    explanation:
      "This distinction is critical for verification engineers and is asked frequently in interviews at companies with formal verification practices.\n\nThe verification closure problem: you need to prove that the DUT behaves correctly across all legal inputs. Simulation alone cannot do this exhaustively — the state space is too large. The industry uses a combination of: constrained-random simulation (cover the space randomly), functional coverage (measure how much of the interesting space you've hit), formal verification (prove properties for all inputs), and co-simulation with a reference model (ISS for CPUs).\n\nFor RISC-V CPU verification, riscv-formal (by YosysHQ) uses formal methods to verify ISA compliance. RISC-V Torture and riscv-tests provide directed test suites. RISC-V compliance tests are required for certification.",
    resources: [
      { title: "riscv-formal verification framework", url: "https://github.com/YosysHQ/riscv-formal", type: "repo" },
      { title: "VexRiscv verification", url: "https://github.com/SpinalHDL/VexRiscv", type: "repo" },
    ],
  },
  {
    id: "l3-q8",
    level: 3,
    topic: "AI Accelerator Architecture",
    question:
      "What is a systolic array and why is it well-suited for matrix multiplication in neural network inference? What are its limitations?",
    reference_answer:
      "A systolic array is a network of processing elements (PEs) arranged in a grid where data flows rhythmically through the array, with each PE computing a multiply-accumulate (MAC) and passing partial results to neighbors. For matrix multiplication C = A × B: A elements flow horizontally, B elements flow vertically, and partial sums accumulate as they pass through PEs. Well-suited because: (1) High compute density — each PE is busy every cycle; (2) Data reuse — each A and B element passes through multiple PEs, amortizing memory bandwidth; (3) Regular structure — maps to efficient VLSI layout; (4) Deterministic timing — easy to pipeline and time. Limitations: (1) Poor utilization for non-square or non-multiple-of-array-size matrices (padding overhead); (2) Inflexible for irregular sparsity patterns; (3) Latency to fill/drain the array (pipeline bubble); (4) Control flow and non-linear operations (activations, normalization) are done off-array.",
    explanation:
      "Systolic arrays are the core compute engine of Google's TPU, AWS Trainium, and many AI accelerator startups. The original concept is from H.T. Kung and C.E. Leiserson (1978). The TPU v1 paper (Jouppi et al., 2017) is mandatory reading for AI hardware roles.\n\nThe memory bandwidth bottleneck (roofline model) is why systolic arrays are designed to maximize arithmetic intensity (FLOPs per byte of memory access). Weight-stationary, output-stationary, and input-stationary dataflows are different strategies for which operand stays in the PE registers across cycles, each with different bandwidth requirements.\n\nFor startups: the differentiation from NVIDIA GPUs often comes from: higher energy efficiency (J/inference), lower latency for specific model sizes, or better support for sparsity. Companies like Groq (deterministic latency), Cerebras (wafer-scale), and Tenstorrent (mesh NoC + sparse support) each make different architectural bets.",
    resources: [
      { title: "Google TPU v1 Paper (Jouppi et al. 2017)", url: "https://arxiv.org/abs/1704.04760", type: "paper" },
      { title: "Gemmini open-source systolic array", url: "https://github.com/ucb-bar/gemmini", type: "repo" },
    ],
  },
];

export const getQuestionsByLevel = (level: number): Question[] =>
  questions.filter((q) => q.level === level);

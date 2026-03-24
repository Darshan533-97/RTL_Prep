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
    hints: [
      "Consider what triggers the output change — is it a continuous level or a single moment in time?",
      "One device is 'transparent' while its enable is high (you can see D through to Q). The other only captures D at one specific instant.",
      "A latch is level-sensitive: Q follows D whenever enable is HIGH. A flip-flop is edge-triggered: Q only updates on the clock edge (rising or falling). Use flip-flops in synchronous designs to prevent glitch propagation and simplify STA.",
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
    hints: [
      "Think about the SystemVerilog keywords: always_comb vs always_ff. What does each tell the tool about the intended hardware?",
      "Two key signals for the tool: the sensitivity list and the assignment type (= vs <=). One implies storage, the other doesn't. What happens if you forget an else in a combinational block?",
      "always_comb → combinational (use = blocking). always_ff @(posedge clk) → sequential (use <= non-blocking). Missing else/default in always block → latch inferred (a common interview trap). always_comb makes a missing else a compile error.",
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
    hints: [
      "Think about a 'window' around the clock edge where the data input must be stable. What are the two sides of that window?",
      "One constraint is about time BEFORE the clock edge (so the FF can 'prepare'), the other is about time AFTER the edge (so the FF can 'capture' reliably).",
      "Setup = data stable for Tsu BEFORE the clock edge (violation → metastability). Hold = data stable for Th AFTER the edge (violation → wrong data captured). Fmax = 1/(Tclk_to_q + Tcomb + Tsu). Hold violations are fixed with buffer insertion — slowing the clock does NOT help.",
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
    hints: [
      "Start with an always_ff block. What goes in the sensitivity list for a synchronous design?",
      "Synchronous reset means the reset check goes INSIDE the clocked block (not in the sensitivity list). Use non-blocking assignments (<=).",
      "always_ff @(posedge clk) begin if (rst) count <= 4'b0; else count <= count + 1'b1; end — That's the complete module body. 4-bit wraps naturally from 15 back to 0.",
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
    hints: [
      "Think about what happens when two flip-flops run on completely independent clocks. Can you guarantee when a signal will be sampled?",
      "The primary danger is metastability — if the signal changes near the receiving clock edge, the FF output may be indeterminate. This is especially tricky for multi-bit buses.",
      "Use a 2-FF synchronizer for single bits (gives one full cycle for metastability to resolve). For multi-bit: async FIFO with Gray-coded pointers, or a handshake protocol. Never synchronize each bit of a bus independently — you'll get torn reads.",
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
    hints: [
      "Draw the state diagram first. What partial sequences lead toward '101'? You need to track whether you've seen '1', then '10'.",
      "You need 3 states (not 2!): IDLE, GOT1, GOT10. Separate the state register (always_ff) from next-state logic (always_comb). Is the detect output Mealy or Moore?",
      "States: IDLE→(in=1)→GOT1, GOT1→(in=0)→GOT10, GOT10→(in=1)→GOT1 and assert detect. GOT10→(in=0)→IDLE. detect is Mealy (depends on current state + input). Use typedef enum for named states.",
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
    hints: [
      "When does each assignment type actually write its result? One is immediate, one is deferred.",
      "Consider a shift register swapping values: a = b; b = a; in always_ff. What value does b get? What about with non-blocking?",
      "Blocking (=): executes immediately, sequential — use in always_comb. Non-blocking (<=): RHS evaluated now, LHS updated at end of time step — use in always_ff. Using = in always_ff on a shift register collapses two FFs into one (both get the same value).",
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
    hints: [
      "How do you pass a configurable width to a module so it can be changed at instantiation time without editing the source?",
      "The syntax is #(parameter int N = 8) in the module declaration. Port widths then use [N-1:0]. What does generate do differently from regular RTL?",
      "module reg_n #(parameter int N = 8) with logic [N-1:0] d, q. Use '0 for width-inferred zero (cleaner than {N{1'b0}}). Generate runs at elaboration time to replicate/conditionally instantiate modules — not at simulation time.",
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
    hints: [
      "Categorize hazards by what is 'in conflict': a hardware resource, a data dependency, or program flow control.",
      "Forwarding routes results from later pipeline stages back to the ALU inputs. But what if the result isn't even computed yet when the next instruction needs it?",
      "Structural: resource conflict (e.g., single memory port). Data: RAW (forwarding fixes most, but load-use needs 1 stall — result not ready until end of MEM). Control: branch redirects fetch. Forwarding compares dest registers of EX/MEM with src registers of ID/EX.",
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
    hints: [
      "If you synchronize each bit of a bus independently, what guarantee do you have about which bits are from the 'old' value vs the 'new' value?",
      "The problem is 'torn reads' — different bits resolve their metastability in different cycles, giving a nonsense intermediate value. Gray code solves this for one specific pattern. What's the general solution?",
      "Solutions: (1) Async FIFO with Gray-coded pointers (only 1 bit changes per increment — safe to synchronize individually). (2) Gray encode counters before crossing. (3) Handshake (req/ack through synchronizers). Never synchronize multi-bit buses bit-by-bit.",
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
    hints: [
      "Think about how many possible 'slots' a given memory address can land in. That number defines the associativity.",
      "More choices (ways) means fewer conflict misses, but you have to compare more tags in parallel. What structures grow with the number of ways?",
      "Direct-mapped=1 location (fast, cheap, conflict misses). N-way=N comparators in parallel, N-to-1 mux, replacement logic. Fully associative=comparator per line (only for TLBs/victim caches). More ways → lower miss rate, higher area/latency. LRU→PLRU approximation for cost.",
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
    hints: [
      "Not every path in the synthesized netlist can actually be active at runtime. What do you call a path that exists in the netlist but can never carry real data?",
      "A false path is one that's structurally present but functionally unreachable. A multicycle path is real but intentionally slow. Can you think of a clock mux example for false paths?",
      "False path: a clock-domain mux off-path input (set_false_path — removes from STA). Multicycle path: a divider read only every 4 cycles (set_multicycle_path 4 — relaxes constraint). Both must be justified by microarchitectural intent; misuse masks real timing bugs.",
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
    hints: [
      "AXI4 has 5 channels. Think about why read and write operations each need an address channel AND a data channel — and writes also need a response.",
      "Separating address from data enables pipelining: a new address can be accepted before the previous transaction completes. What does the valid/ready handshake accomplish?",
      "5 channels: AW (write addr), W (write data), B (write response), AR (read addr), R (read data). valid/ready: transfer only when BOTH high. Address/data separation → multiple outstanding transactions via IDs. AXI-Lite = simplified (no bursts), AXI-Stream = no address (streaming).",
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
    hints: [
      "Asynchronous assertion is desirable (works even without a clock), but what's the danger of asynchronous deassertion when the clock is running?",
      "If reset deasserts near a clock edge, different flip-flops across the chip might come out of reset on different clock cycles. What structure fixes this?",
      "Reset synchronizer: 2 FFs with async reset in series. Assert → both FFs go to 0 immediately. Deassert → propagates synchronously through 2 stages. Each clock domain needs its own synchronizer. Best of both: async assert (works without clock) + sync deassert (safe).",
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
    hints: [
      "A FIFO needs read and write pointers. How do you tell if it's empty vs full when both pointers point to the same location?",
      "Use pointers that are 1 bit wider than the address bits. The extra MSB tracks how many times the pointer has wrapped around. When does empty differ from full using this scheme?",
      "Empty: wr_ptr == rd_ptr (all bits equal, same wrap count). Full: MSBs differ, lower bits equal (wr wrapped once more than rd). assign full = (wr_ptr[ADDR_W] != rd_ptr[ADDR_W]) && (wr_ptr[ADDR_W-1:0] == rd_ptr[ADDR_W-1:0]).",
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
    hints: [
      "Clock gating saves power by disabling the clock to FFs that won't change. Why can't you just AND the enable directly with the clock signal?",
      "Glitches on the enable would corrupt the gated clock. The ICG cell uses a latch to prevent this. When does the latch sample the enable, and why?",
      "ICG cell: negative-level-sensitive latch (samples enable when CLK is LOW) + AND gate. The latch prevents enable glitches from propagating. Enable must be stable during CLK high phase. Synthesizers infer ICGs from enable conditions in always_ff. DFT requires ICGs to be scan-testable.",
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
    hints: [
      "Tomasulo solves two types of hazards: true dependencies (RAW) and false dependencies (WAW, WAR). How does register renaming eliminate false dependencies?",
      "Think about the four key structures: where instructions wait for operands, how results are broadcast, how register names are tracked, and how in-order retirement is maintained.",
      "RAT maps arch registers → physical registers (eliminates WAR/WAW false deps). Reservation stations hold instructions until operands ready. CDB broadcasts results to all RS simultaneously. ROB enables precise exceptions and in-order retirement by committing from the head.",
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
    hints: [
      "Each predictor uses more information than the previous. Bimodal uses only the branch's own past. What extra information does gshare add?",
      "Gshare adds global branch history (correlates with recent branches). TAGE goes further — it uses multiple history lengths simultaneously. Why is a single history length a compromise?",
      "Bimodal: 2-bit counter indexed by PC (branch-local history). Gshare: XOR(PC, GHR) → correlation with recent branches. TAGE: multiple tables with geometrically increasing history lengths; uses longest matching table. Key: different branches need different history depths.",
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
    hints: [
      "Memory consistency is about the ORDER in which stores from one core become VISIBLE to other cores. Why would a CPU ever delay making a store visible?",
      "Store buffers let a CPU continue without waiting for the store to reach the shared cache. This breaks SC. What is TSO's specific relaxation?",
      "SC: all ops appear in some total order consistent with program order (slow — requires store to be globally visible before continuing). TSO: stores go to a buffer (visible to self immediately, to others later) — allows write→read reordering. ARM/RISC-V (RVWMO) allow even more reorderings; use FENCE to enforce order.",
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
    hints: [
      "What does 'Modified' mean in MESI? If a line is Modified, where is the only copy of the correct data?",
      "The Modified core has the only valid copy — memory is stale. When Core B reads that line, the Modified core must intervene. What are the steps?",
      "Core B issues BusRd → snoop detects Core A has M → Core A writes back (or forwards directly) → Core A: M→Invalid or Shared → Core B: Invalid→Shared. Memory is updated because only Core A had correct data. MOESI adds Owned state to avoid unnecessary memory writeback.",
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
    hints: [
      "For every structure that must handle N operations per cycle, ask: does the hardware cost grow linearly or super-linearly with N?",
      "The wakeup logic for reservation stations is O(N²). Register file ports grow multiplicatively with execution unit count. What's the fundamental ILP limit in real code?",
      "Bottlenecks: fetch bandwidth (8 insn/cycle, multi-branch prediction), decode (8 in parallel), rename (8 RAT writes atomically), wakeup O(RS×N) comparators, RF ports (2R+1W per EU = 24R+8W for 8-wide), retire 8/cycle. Real ILP in code rarely exceeds 3-4 IPC — SMT/multi-core is more efficient.",
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
    hints: [
      "Timing closure means all paths meet setup/hold after place-and-route. Why can't the physical design team just 'fix it' with buffers and optimizations?",
      "Critical paths are determined by RTL structure — a deep combinational chain will fail timing regardless of physical tricks. What's the budget in FO4 delays?",
      "RTL determines critical paths: deep logic chains, wide priority encoders, large mux trees all eat timing budget. ~15-20 FO4 delays per cycle. Physical fixes (buffering) add area/power but can't shorten logic depth. RTL fixes: pipeline long paths, restructure arithmetic, use one-hot encoding.",
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
    hints: [
      "Code coverage tells you what code ran. What does it NOT tell you about correctness?",
      "Code coverage is structural (what lines executed). Functional coverage is semantic (what scenarios were exercised). Can you have 100% line coverage but miss a critical corner case?",
      "100% code coverage: every line ran, but never tested cache-full+store+interrupt corner case. Code coverage can't detect missing features (no code to cover). Functional coverage: covergroups define meaningful scenarios (hit/miss × load/store × privilege). Use constrained-random + functional coverage + formal for closure.",
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
    hints: [
      "Think about how data flows in a grid of processing elements. What operation does each PE do, and where does data go after it's processed?",
      "The key advantage is data reuse: each element of A and B passes through multiple PEs, so you need fewer memory accesses per FLOP. What are the limitations for irregular or sparse workloads?",
      "A×B: A flows horizontally, B flows vertically, partial sums accumulate through PEs. High arithmetic intensity (FLOPs/byte — roofline model). Limitations: poor utilization for non-square matrices, inflexible for sparsity, pipeline fill/drain latency, non-linear ops (activations) done off-array.",
    ],
  },
  // ─── LEVEL 4: REAL-WORLD CELLS (common_cells / PULP Platform) ───────────────
  {
    id: "l4-q1",
    level: 4,
    topic: "Leading Zero Counter (lzc)",
    question: "Implement a parameterized leading/trailing zero counter in SystemVerilog. Given an N-bit input vector, output the number of leading zeros (from MSB) or trailing zeros (from LSB) based on a MODE parameter. Also output an empty flag when no zeros are found.",
    reference_answer: "```systemverilog\nmodule lzc #(\n  parameter int WIDTH = 8,\n  parameter bit MODE  = 1'b0  // 0=leading zeros, 1=trailing zeros\n) (\n  input  logic [WIDTH-1:0]         in_i,\n  output logic [$clog2(WIDTH)-1:0] cnt_o,\n  output logic                     empty_o\n);\n\n  // Reverse input for trailing-zero mode\n  logic [WIDTH-1:0] in_rev;\n  always_comb begin\n    for (int i = 0; i < WIDTH; i++)\n      in_rev[i] = in_i[WIDTH-1-i];\n  end\n\n  logic [WIDTH-1:0] sel;\n  assign sel = MODE ? in_i : in_rev;\n\n  // Recursive tree: find first 1 from MSB\n  // For a WIDTH-bit input, use priority encoder logic\n  always_comb begin\n    cnt_o   = '0;\n    empty_o = 1'b1;\n    for (int i = WIDTH-1; i >= 0; i--) begin\n      if (sel[i]) begin\n        cnt_o   = WIDTH - 1 - i;\n        empty_o = 1'b0;\n      end\n    end\n  end\nendmodule\n```\n\nThe real `lzc.sv` from common_cells uses a recursive generate-based tree for better synthesis QoR: it splits the input in half, solves each half recursively, then merges results. The tree has depth $clog2(WIDTH), giving O(log N) critical path. The `empty_o` flag is 1 when all bits of the input are 1 (no zeros to count — the input is all ones). For trailing-zero mode, the input is reversed before processing.",
    explanation: "Leading zero counting is fundamental in floating-point normalization (finding the shift amount to normalize a mantissa), priority encoding, and arbitration. The naive loop implementation has O(N) critical path depth. The generate-based recursive approach in common_cells halves the problem each level, achieving O(log N) depth — critical for wide inputs (e.g., 64-bit) at high frequency.\n\nKey implementation note: `empty_o` is misnamed in some descriptions — it is actually high when the input has *no zeros* to count (all bits are 1), meaning the counter output is meaningless. In floating-point, this indicates a zero mantissa.\n\nSynthesis tip: a for-loop priority encoder in always_comb will synthesize to a chain of muxes (O(N) depth). The recursive tree synthesizes to a balanced tree of half-selectors (O(log N) depth). For 64-bit inputs at 1GHz+, this difference matters.",
    hints: [
      "Think about using a generate block to recursively split the input in half",
      "Use $clog2(WIDTH) to determine output width",
      "The empty flag should be 1 when all bits are 1 (no zeros to count)",
    ],
    source_note: "Inspired by common_cells / lzc.sv — ETH Zurich / PULP Platform (Solderpad License)",
    resources: [],
  },
  {
    id: "l4-q2",
    level: 4,
    topic: "Spill Register (valid/ready)",
    question: "Implement a spill register in SystemVerilog — a two-entry buffer that cuts all combinational paths between a valid/ready producer and consumer. The module must have: valid_i/ready_o on input side, valid_o/ready_i on output side, parameterized data type T. It should accept new data even when the output is stalled (this is what makes it a spill register, not a simple register).",
    reference_answer: "```systemverilog\nmodule spill_register #(\n  parameter type T = logic [7:0]\n) (\n  input  logic clk_i,\n  input  logic rst_ni,\n  // Input side\n  input  logic valid_i,\n  output logic ready_o,\n  input  T     data_i,\n  // Output side\n  output logic valid_o,\n  input  logic ready_i,\n  output T     data_o\n);\n\n  // Main register\n  T     main_data;\n  logic main_valid;\n  // Spill register (overflow slot)\n  T     spill_data;\n  logic spill_valid;\n\n  assign ready_o = !spill_valid;  // Accept when spill slot is empty\n  assign valid_o = main_valid;\n  assign data_o  = main_data;\n\n  always_ff @(posedge clk_i or negedge rst_ni) begin\n    if (!rst_ni) begin\n      main_valid  <= 1'b0;\n      spill_valid <= 1'b0;\n    end else begin\n      // Consumer takes data\n      if (ready_i && main_valid) begin\n        main_valid <= spill_valid;\n        main_data  <= spill_data;\n        spill_valid <= 1'b0;\n      end\n      // Producer pushes data\n      if (valid_i && ready_o) begin\n        if (!main_valid || ready_i) begin\n          main_valid <= 1'b1;\n          main_data  <= data_i;\n        end else begin\n          spill_valid <= 1'b1;\n          spill_data  <= data_i;\n        end\n      end\n    end\n  end\nendmodule\n```\n\nThe key property: `ready_o` depends only on internal state (`spill_valid`), not on `ready_i`. This fully cuts the combinational ready path from consumer to producer, which is the primary use case for a spill register in pipeline design.",
    explanation: "In a valid/ready handshake (AXI-stream style), a combinational dependency from `ready_i` back to `ready_o` creates a long combinational path across pipeline stages. In a deep pipeline, this ready chain can span many stages and become the critical path.\n\nThe spill register breaks this: `ready_o` depends only on whether the spill slot is occupied — a registered signal. The consumer's `ready_i` never directly gates the producer's `ready_o`.\n\nThe two-slot design is minimal: one slot for data currently being presented to the consumer, one slot to absorb one cycle of backpressure. With only one slot (a simple register), you'd have to deassert `ready_o` as soon as you have data, creating bubble cycles.\n\nIn the common_cells implementation, there is also a `flush_i` port for pipeline flush support. The parameterized type T allows any struct or packed array to flow through.",
    hints: [
      "You need 2 storage slots: one main register and one overflow/spill slot",
      "ready_o should be high when the spill slot is empty",
      "When both slots are full and ready_i is low, backpressure must propagate",
    ],
    source_note: "Inspired by common_cells / spill_register_flushable.sv — ETH Zurich (Solderpad License)",
    resources: [],
  },
  {
    id: "l4-q3",
    level: 4,
    topic: "Parameterized FIFO (fifo_v3)",
    question: "Design a parameterized synchronous FIFO in SystemVerilog with: configurable DEPTH and DATA_WIDTH, a FALL_THROUGH parameter (when 1, data written in cycle N is readable in cycle N without a clock edge), full/empty flags, and a usage counter. The FALL_THROUGH mode requires a combinational bypass path.",
    reference_answer: "```systemverilog\nmodule fifo_v3 #(\n  parameter int DEPTH      = 8,\n  parameter int DATA_WIDTH = 32,\n  parameter bit FALL_THROUGH = 1'b0\n) (\n  input  logic                  clk_i, rst_ni,\n  input  logic                  flush_i,\n  // Write port\n  input  logic                  push_i,\n  input  logic [DATA_WIDTH-1:0] wdata_i,\n  output logic                  full_o,\n  // Read port\n  input  logic                  pop_i,\n  output logic [DATA_WIDTH-1:0] rdata_o,\n  output logic                  empty_o,\n  output logic [$clog2(DEPTH):0] usage_o\n);\n\n  localparam int PTR_W = $clog2(DEPTH) + 1; // +1 bit to distinguish full/empty\n\n  logic [PTR_W-1:0] wr_ptr, rd_ptr;\n  logic [DATA_WIDTH-1:0] mem [DEPTH];\n\n  assign usage_o = wr_ptr - rd_ptr;  // unsigned, works with wrap\n  assign full_o  = (usage_o == DEPTH);\n  assign empty_o = (usage_o == 0);\n\n  always_ff @(posedge clk_i or negedge rst_ni) begin\n    if (!rst_ni || flush_i) begin\n      wr_ptr <= '0;\n      rd_ptr <= '0;\n    end else begin\n      if (push_i && !full_o) begin\n        mem[wr_ptr[$clog2(DEPTH)-1:0]] <= wdata_i;\n        wr_ptr <= wr_ptr + 1;\n      end\n      if (pop_i && !empty_o)\n        rd_ptr <= rd_ptr + 1;\n    end\n  end\n\n  // Read data: fall-through bypass or registered\n  if (FALL_THROUGH) begin : gen_ft\n    always_comb begin\n      if (empty_o && push_i)\n        rdata_o = wdata_i;  // Bypass: show write data combinationally\n      else\n        rdata_o = mem[rd_ptr[$clog2(DEPTH)-1:0]];\n    end\n  end else begin : gen_reg\n    assign rdata_o = mem[rd_ptr[$clog2(DEPTH)-1:0]];\n  end\nendmodule\n```\n\nThe extra pointer bit (PTR_W = $clog2(DEPTH) + 1) is the classic trick: full when wr_ptr - rd_ptr == DEPTH, empty when they are equal. Using only $clog2(DEPTH) bits, you cannot distinguish full from empty when pointers wrap to the same value.",
    explanation: "This FIFO pattern appears in virtually every real digital design. Key design decisions:\n\n**Pointer width trick**: Using one extra bit beyond the address width allows a simple unsigned subtraction to give usage count and correct full/empty detection even across pointer wrap-around. This is cleaner than the MSB-flip trick (which only gives full/empty, not count).\n\n**Fall-through mode**: Useful when the consumer needs data in the same cycle it was written (e.g., a receive buffer where you want zero latency when non-empty). Requires the bypass combinational path. Be careful: this creates a combinational path from `push_i`/`wdata_i` to `rdata_o`, which may affect timing.\n\n**Flush**: A synchronous flush should reset both pointers. The `rst_ni` is async reset. In real designs, be careful with async reset on memory arrays — many synthesis tools handle this differently.\n\nIn common_cells `fifo_v3.sv`, the same structure is used with additional support for a THRESHOLD output for flow control.",
    hints: [
      "Use $clog2(DEPTH) for pointer width, but add 1 extra bit to distinguish full from empty",
      "Fall-through: when empty and push happens same cycle as pop, bypass directly",
      "The usage count = write_pointer - read_pointer (unsigned subtraction handles wrap)",
    ],
    source_note: "Inspired by common_cells / fifo_v3.sv — ETH Zurich / Florian Zaruba (Solderpad License)",
    resources: [],
  },
  {
    id: "l4-q4",
    level: 4,
    topic: "Round-Robin Arbiter",
    question: "Implement a fair round-robin arbiter in SystemVerilog for N requestors. The arbiter maintains a rotating priority pointer. In fair mode: after granting requestor i, the next highest-priority requestor is the one with the next higher index that has an active request (wrapping around). Output a one-hot grant signal.",
    reference_answer: "```systemverilog\nmodule rr_arbiter #(\n  parameter int N = 4\n) (\n  input  logic       clk_i,\n  input  logic       rst_ni,\n  input  logic [N-1:0] req_i,\n  output logic [N-1:0] grant_o\n);\n\n  logic [$clog2(N)-1:0] prio;  // current lowest-priority index\n\n  // Rotate requests: double the vector to handle wrap\n  logic [2*N-1:0] req_double;\n  assign req_double = {req_i, req_i};\n\n  // Find first set bit starting at prio+1 (wrapping)\n  logic [2*N-1:0] mask;\n  always_comb begin\n    grant_o = '0;\n    // Mask: only consider from prio+1 onward\n    for (int i = 0; i < 2*N; i++)\n      mask[i] = (i > prio && i < prio + N) ? req_double[i] : 1'b0;\n\n    // Find lowest set bit in masked vector\n    for (int i = prio+1; i < prio+N+1; i++) begin\n      if (req_double[i % N] && !grant_o) begin  // simplified\n        grant_o[i % N] = 1'b1;\n      end\n    end\n  end\n\n  // Update priority after grant\n  always_ff @(posedge clk_i or negedge rst_ni) begin\n    if (!rst_ni)\n      prio <= '0;\n    else if (|grant_o) begin\n      // Find which was granted\n      for (int i = 0; i < N; i++)\n        if (grant_o[i]) prio <= i[$clog2(N)-1:0];\n    end\n  end\nendmodule\n```\n\nThe `rr_arb_tree` in common_cells uses a binary tree of 2-way arbiters rather than a loop, giving O(log N) critical path depth. For large N (e.g., 64 requestors in a NoC), the tree structure is essential for timing closure.",
    explanation: "Round-robin arbiters are everywhere in on-chip interconnects: AXI crossbars, NoC routers, shared bus arbiters, FIFO port selectors.\n\nThe core algorithm: maintain a 'last granted' pointer. On each arbitration, the highest priority is the requestor just above the last-granted one (modulo N). If none above, wrap around.\n\nThe double-vector trick (replicate req_i twice, search from prio+1 to prio+N) elegantly handles the wrap-around without explicit modular arithmetic in the loop.\n\nIn common_cells `rr_arb_tree.sv`, the tree structure recursively builds 2-way arbiters. At each level, two sub-trees compete, with the winner selected based on the current priority. The tree approach parallelizes the comparison and is more synthesis-friendly for large N.\n\nFairness consideration: this is work-conserving (grants to whoever is requesting) and starvation-free (each requestor gets priority in rotation). Non-work-conserving arbiters (skip slots even when requested) exist but are rare.",
    hints: [
      "Store the last-granted index in a register — this becomes the lowest priority next cycle",
      "Mask the requests below (and equal to) the current priority pointer, find first set bit in masked vector",
      "If no requests above priority pointer, fall back to checking all requests from index 0",
    ],
    source_note: "Inspired by common_cells / rr_arb_tree.sv — ETH Zurich (Solderpad License)",
    resources: [],
  },
  {
    id: "l4-q5",
    level: 4,
    topic: "Pseudo-LRU Tree (plru_tree)",
    question: "Implement a pseudo-LRU (PLRU) replacement policy for an N-way cache set using a binary tree of bits. Given a one-hot used_i signal (which way was accessed), update the internal tree state and output a one-hot plru_o signal indicating the least recently used way to evict.",
    reference_answer: "```systemverilog\nmodule plru_tree #(\n  parameter int N_WAYS = 4  // Must be power of 2\n) (\n  input  logic             clk_i,\n  input  logic             rst_ni,\n  input  logic [N_WAYS-1:0] used_i,   // one-hot: way that was accessed\n  output logic [N_WAYS-1:0] plru_o    // one-hot: way to evict\n);\n  // N_WAYS-1 internal tree bits (binary tree)\n  logic [N_WAYS-2:0] tree_q, tree_d;\n\n  always_ff @(posedge clk_i or negedge rst_ni) begin\n    if (!rst_ni) tree_q <= '0;\n    else         tree_q <= tree_d;\n  end\n\n  always_comb begin\n    tree_d = tree_q;\n    // Update: for each accessed way, set bits on path from root to leaf\n    // pointing AWAY from the accessed way\n    for (int i = 0; i < N_WAYS; i++) begin\n      if (used_i[i]) begin\n        // Walk tree from root, updating bits on path to leaf i\n        // (specific indices depend on N_WAYS tree layout)\n        // For N=4:\n        // root=0: left subtree=ways 0,1 / right=ways 2,3\n        // level1: node1 for ways 0,1; node2 for ways 2,3\n        // way 0: update tree[0]=1 (go right), tree[1]=1 (go right)\n        // way 1: update tree[0]=1 (go right), tree[1]=0 (go left)\n        // way 2: update tree[0]=0 (go left),  tree[2]=1 (go right)\n        // way 3: update tree[0]=0 (go left),  tree[2]=0 (go left)\n      end\n    end\n    // PLRU: traverse tree following bits to find LRU leaf\n    // plru_o = one-hot way at the leaf reached by following tree bits\n  end\nendmodule\n```\n\nThe real common_cells `plru_tree.sv` generates the tree paths using a recursive generate block, parameterized over N_WAYS. Each internal node index maps to specific ways in its subtree. The update and traversal use `for` loops over tree levels with computed indices.",
    explanation: "True LRU for an N-way set requires maintaining a complete ordering of N elements — that's O(N log N) state bits and complex update logic. PLRU approximates this with only N-1 bits (a binary tree), making it practical for hardware.\n\nTree structure for N=4:\n```\n        [0]\n       /   \\\n     [1]   [2]\n    / \\   / \\\n   W0 W1 W2 W3\n```\nEach internal node bit: 0 = 'LRU is in left subtree', 1 = 'LRU is in right subtree'.\n\n**Update** (way i accessed): on the path from root to leaf i, set each bit to point *away* from i's subtree (because i was just used, so it's no longer LRU).\n\n**Eviction** (find PLRU): traverse from root, following bits (0=go left, 1=go right) until you reach a leaf — that's the PLRU way.\n\nPLRU gives ~85-95% of true LRU hit rate in practice. It's used in CVA6's L1 cache and many commercial designs. The PLRU miss rate penalty over true LRU is typically <1% for most workloads.",
    hints: [
      "A PLRU tree for N ways needs N-1 internal bits arranged as a binary tree",
      "When way i is accessed, update the bits on the path from root to leaf i — each bit points away from the accessed way",
      "The LRU way is found by traversing the tree following each bit (bit=0 → go left, bit=1 → go right)",
    ],
    source_note: "Inspired by common_cells / plru_tree.sv — ETH Zurich / David Schaffenrath, Florian Zaruba (Solderpad License)",
    resources: [],
  },
  {
    id: "l4-q6",
    level: 4,
    topic: "Gray Code CDC FIFO",
    question: "Design an asynchronous FIFO that safely crosses clock domains using Gray-coded pointers. The write side uses clk_w, the read side uses clk_r. Explain why you must Gray-code the pointers before synchronizing them across clock domains, and show the full implementation with correct full/empty flag generation.",
    reference_answer: "```systemverilog\nmodule cdc_fifo_gray #(\n  parameter int DATA_WIDTH = 32,\n  parameter int LOG2_DEPTH = 3   // depth = 2^LOG2_DEPTH\n) (\n  // Write domain\n  input  logic                  clk_w, rst_w_ni,\n  input  logic                  push_i,\n  input  logic [DATA_WIDTH-1:0] wdata_i,\n  output logic                  wfull_o,\n  // Read domain\n  input  logic                  clk_r, rst_r_ni,\n  input  logic                  pop_i,\n  output logic [DATA_WIDTH-1:0] rdata_o,\n  output logic                  rempty_o\n);\n  localparam DEPTH = 2**LOG2_DEPTH;\n  localparam PTR_W = LOG2_DEPTH + 1;  // +1 for full/empty distinction\n\n  logic [DATA_WIDTH-1:0] mem [DEPTH];\n\n  // Write pointer (binary) in write domain\n  logic [PTR_W-1:0] wptr_bin, wptr_gray;\n  // Read pointer (binary) in read domain\n  logic [PTR_W-1:0] rptr_bin, rptr_gray;\n\n  // Synchronized pointers (2-FF synchronizers)\n  logic [PTR_W-1:0] rptr_gray_sync1, rptr_gray_sync2;  // in write domain\n  logic [PTR_W-1:0] wptr_gray_sync1, wptr_gray_sync2;  // in read domain\n\n  // Write domain logic\n  always_ff @(posedge clk_w or negedge rst_w_ni) begin\n    if (!rst_w_ni) wptr_bin <= '0;\n    else if (push_i && !wfull_o) wptr_bin <= wptr_bin + 1;\n  end\n  // Binary to Gray\n  assign wptr_gray = wptr_bin ^ (wptr_bin >> 1);\n\n  // Read domain logic\n  always_ff @(posedge clk_r or negedge rst_r_ni) begin\n    if (!rst_r_ni) rptr_bin <= '0;\n    else if (pop_i && !rempty_o) rptr_bin <= rptr_bin + 1;\n  end\n  assign rptr_gray = rptr_bin ^ (rptr_bin >> 1);\n\n  // 2-FF synchronizers\n  always_ff @(posedge clk_w) {rptr_gray_sync2, rptr_gray_sync1} <= {rptr_gray_sync1, rptr_gray};\n  always_ff @(posedge clk_r) {wptr_gray_sync2, wptr_gray_sync1} <= {wptr_gray_sync1, wptr_gray};\n\n  // Full: MSBs differ, lower bits equal (in Gray domain)\n  assign wfull_o  = (wptr_gray == {~rptr_gray_sync2[PTR_W-1], rptr_gray_sync2[PTR_W-2:0]});\n  // Empty: all bits equal\n  assign rempty_o = (rptr_gray == wptr_gray_sync2);\n\n  // Memory\n  always_ff @(posedge clk_w)\n    if (push_i && !wfull_o)\n      mem[wptr_bin[LOG2_DEPTH-1:0]] <= wdata_i;\n  assign rdata_o = mem[rptr_bin[LOG2_DEPTH-1:0]];\nendmodule\n```\n\nWhy Gray code: a binary counter can change multiple bits simultaneously (e.g., 0111→1000 flips all 4 bits). If a synchronizer samples during this transition, it can capture any of 16 values — a multi-bit metastability risk. Gray code guarantees only 1 bit changes per increment, so a synchronizer can only produce one of two valid adjacent values, both of which are correct for the protocol.",
    explanation: "The CDC FIFO is one of the most important and error-prone digital design patterns. The Gray-code trick is elegant: since only 1 bit changes per count step, a synchronizer can only capture one of two adjacent pointer values — the old value or the new value. Both are valid: if you see the old value, you think the FIFO has one fewer entry than it does (safe: slightly conservative), never more than it does (which would be unsafe).\n\n**Full flag (write domain perspective)**: The FIFO is full when the write pointer has lapped the read pointer — they point to the same slot but the write pointer is 'one lap ahead'. In the Gray+extra-bit encoding, this is when all bits match except the MSB. The full check must use the *synchronized* read pointer (potentially stale) — it can falsely indicate 'not full' but never 'not full when actually full'... wait, actually the opposite: it conservatively says 'full' earlier than necessary but never allows overflow.\n\n**Empty flag (read domain)**: Empty when synchronized write pointer equals read pointer in Gray code — same address, same lap.\n\nThe common_cells `cdc_fifo_gray.sv` handles reset synchronization carefully — both domains must be reset in a coordinated way to avoid pointer corruption at startup.",
    hints: [
      "Binary pointers can change multiple bits simultaneously — Gray code changes only 1 bit per increment, making it safe to synchronize",
      "Synchronize the write pointer to clk_r domain for empty detection; synchronize read pointer to clk_w domain for full detection",
      "Use the extra MSB trick: full when synchronized write ptr MSB != read ptr MSB but lower bits match; empty when all bits equal",
    ],
    source_note: "Inspired by common_cells / cdc_fifo_gray.sv — ETH Zurich (Solderpad License)",
    resources: [],
  },
  {
    id: "l4-q7",
    level: 4,
    topic: "Binary ↔ Gray Code Converter",
    question: "Write synthesizable SystemVerilog for: (a) binary_to_gray: convert an N-bit binary number to Gray code, (b) gray_to_binary: convert an N-bit Gray code back to binary. Then explain why Gray code is used for multi-bit values crossing clock domain boundaries.",
    reference_answer: "```systemverilog\n// (a) Binary to Gray — combinational, parallel\nmodule binary_to_gray #(\n  parameter int N = 8\n) (\n  input  logic [N-1:0] bin_i,\n  output logic [N-1:0] gray_o\n);\n  assign gray_o = bin_i ^ (bin_i >> 1);\nendmodule\n\n// (b) Gray to Binary — combinational, sequential (each bit depends on prior)\nmodule gray_to_binary #(\n  parameter int N = 8\n) (\n  input  logic [N-1:0] gray_i,\n  output logic [N-1:0] bin_o\n);\n  always_comb begin\n    bin_o[N-1] = gray_i[N-1];  // MSB is unchanged\n    for (int i = N-2; i >= 0; i--)\n      bin_o[i] = bin_o[i+1] ^ gray_i[i];\n  end\nendmodule\n```\n\n**Why Gray code for CDC**: When a binary counter transitions from `0111` to `1000`, all 4 bits change simultaneously. A 2-FF synchronizer sampling this transition could capture `0000`, `0001`, `0010`, `0100`, `0110`, `1000`, or any other combination — all due to independent metastability resolution in each FF. This is a multi-bit metastability problem and can corrupt the pointer value completely.\n\nGray code guarantees exactly 1 bit changes per increment. A synchronizer can only capture the old value or the new value — both differ by exactly 1 count, which is safe for a FIFO pointer (conservative by at most 1 entry).",
    explanation: "The binary-to-Gray conversion is elegantly simple: XOR each bit with the bit above it. The MSB is unchanged. This is a combinational operation with no carry propagation — O(1) gate depth regardless of N.\n\nGray-to-binary conversion is *sequential* in terms of data dependency: each bit depends on all higher bits. It cannot be parallelized in the same way — there is a data dependency chain of depth N. However, this doesn't matter in practice: the conversion happens in the source clock domain before synchronization, so there is a full clock cycle available for the conversion. The critical path is O(N) XOR gates in series, which is still fast.\n\n**XOR tree trick for gray_to_binary**: You can compute each output bit independently using XOR reduction: `bin[i] = ^gray[N-1:i]` (XOR of gray bits from MSB down to position i). This gives O(log N) depth using XOR trees, at the cost of more gates. Synthesis tools often optimize this automatically.\n\nHistorical note: Gray code was patented by Frank Gray at Bell Labs in 1953, originally for use in shaft encoders to avoid spurious transitions as a mechanical encoder moved between positions.",
    hints: [
      "binary_to_gray: gray[i] = bin[i] XOR bin[i+1] (MSB is unchanged: gray[N-1] = bin[N-1])",
      "gray_to_binary: bin[N-1] = gray[N-1], then bin[i] = bin[i+1] XOR gray[i] — it is sequential, not parallel",
      "In CDC: if a binary counter transitions from 0111 to 1000, all 4 bits change — a synchronizer could capture any combination. Gray code ensures only 1 bit changes.",
    ],
    source_note: "Inspired by common_cells / binary_to_gray.sv and gray_to_binary.sv — ETH Zurich (Solderpad License)",
    resources: [],
  },
  {
    id: "l4-q8",
    level: 4,
    topic: "Synchronizer with Edge Detector (sync_wedge)",
    question: "Implement a serial line synchronizer with edge detection in SystemVerilog. The module takes an asynchronous input signal, passes it through a 2-FF synchronizer to prevent metastability, then detects rising and falling edges on the synchronized output. Output: sync_o (synchronized), rise_o (1-cycle pulse on rising edge), fall_o (1-cycle pulse on falling edge).",
    reference_answer: "```systemverilog\nmodule sync_wedge (\n  input  logic clk_i,\n  input  logic rst_ni,\n  input  logic en_i,     // synchronizer enable (tie high if unused)\n  input  logic serial_i, // asynchronous input\n  output logic r_edge_o, // rising edge pulse (1 cycle)\n  output logic f_edge_o, // falling edge pulse (1 cycle)\n  output logic serial_o  // synchronized output\n);\n\n  logic [2:0] sync_q;  // shift register: [2]=delayed, [1]=sync, [0]=first FF\n\n  always_ff @(posedge clk_i or negedge rst_ni) begin\n    if (!rst_ni)\n      sync_q <= '0;\n    else if (en_i)\n      sync_q <= {sync_q[1:0], serial_i};  // shift in new data\n  end\n\n  assign serial_o = sync_q[1];              // 2nd FF output = synchronized\n  assign r_edge_o = sync_q[1] & ~sync_q[2]; // rose: was 0, now 1\n  assign f_edge_o = ~sync_q[1] & sync_q[2]; // fell: was 1, now 0\nendmodule\n```\n\nThe 3-bit shift register approach: bit [0] is the first synchronizing FF (may be metastable), bit [1] is the second FF (resolved, safe to use), bit [2] is the delayed copy for edge detection. The edge outputs are one-cycle pulses, synchronous to clk_i.",
    explanation: "This module is ubiquitous in SoC designs for handling external asynchronous signals: GPIO pins, UART RX, button inputs, interrupt lines from slow peripherals.\n\n**Why 2 FFs**: A single FF sampling an asynchronous signal can go metastable — it may take longer than one clock period to resolve to a valid 0 or 1. The second FF gives the first FF's output a full clock cycle to settle before it is sampled again. With typical FF metastability characteristics (MTBF >> 1 year at common frequencies), the probability of the second FF capturing a metastable value is negligible.\n\n**MTBF calculation**: MTBF = exp(tw/τ) / (f_clock × f_data × C), where tw is the setup window, τ is the metastability resolution time constant (~30ps in 28nm), and C is a process constant. For safety-critical signals, 3 FFs (extra resolution time) or specialized metastability-hardened flops may be used.\n\n**Why NOT use async signals directly**: Metastability in combinational logic (e.g., feeding directly into a decoder or mux) can cause X-propagation — the undefined output corrupts downstream state in ways that are hard to debug.\n\nIn common_cells, `sync_wedge.sv` also includes a `serial_o` that reflects the synchronized value directly, which is useful for level-sensitive receivers in addition to the edge pulses.",
    hints: [
      "The 2-FF synchronizer: two back-to-back flip-flops, both clocked by the destination clock",
      "Edge detection requires a 3rd register to hold the previous synchronized value",
      "rise_o = sync_o AND NOT prev_sync; fall_o = NOT sync_o AND prev_sync",
    ],
    source_note: "Inspired by common_cells / sync_wedge.sv — ETH Zurich (Solderpad License)",
    resources: [],
  },
];

export const getQuestionsByLevel = (level: number): Question[] =>
  questions.filter((q) => q.level === level);

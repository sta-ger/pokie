# PC-03 blind Studio exploration

Candidate: `0d7bc35bd2ab8a752c03f0920ce9e222cd7eeacf`
Run: `run-1787865749738` (fresh Studio registry and browser profile)

The visible Studio journey completed without a rendered product error:

1. **Start a game** opened **Create game**; creating the game exposed **Show project location**. Activating it changed the control state, and reload restored the created workspace at **Overview**.
2. **Play** opened **New Play session**; the session reached a completed round and left **Spin** and **Reset Play session** as useful next actions.
3. **Simulation** opened **Run Simulation**; completion exposed **Repeat simulation locally**.
4. **Build/Export** opened exact-outcome-library generation. Generation completed and exposed the Stake Engine handoff. **Run Stake Engine Export (base)** completed with `Exported 4 file(s)`.
5. **Your projects** listed the created Blueprint; reopening it returned to **Overview** after the artifact handoffs.

Generated-artifact inspection (names, size, SHA-256 only):

| Output | Artifacts |
| --- | --- |
| Blueprint | `blueprint.json` — 1,430 B — `9428e23e9c3b58a215037dcabaec2926b39317d4784c9ca07ea051e843fb1031` |
| Outcome library | `index_base.json` — 263,443 B — `49b531ef7642a50aa1b863c8e83ce7743ee9eb22211b26dc7237c58742dc245a`; `manifest.json` — 4,133 B — `2f4af948d1b37b73aab07a7ceeffcf7e5f99a0e3c9adadb836591d10002a7d5a`; `outcomes_base.jsonl` — 689,326 B — `afc90be68bebaa62f3cb01cf2f653c438873b675998ea36802d6951391929745` |
| Stake Engine export | `books_base.jsonl.zst` — 13,295 B — `c0dc33f77175b4ee5e1a15afaee2a441360645bee7758e2cf1d829b63c66d901`; `index.json` — 183 B — `57e19f4de9b88cc3e45e7a5a2f11e0940b465ff9e09a5e1553d58b384807a5d5`; `lookup_base.csv` — 8,376 B — `a6ab06e0ae86547667fff1418a5d62aa3de9c4b53e7cd1d757cde2267c934dc0`; `pokie-manifest.json` — 903 B — `04ca53e5a4de284f3220925dbfb59f3ce091c400d910a0565a7175fe87646fea` |

No screenshot was retained: the result contained no visual defect requiring one, and the interaction transcript plus artifact checksums supply the reviewable proof.

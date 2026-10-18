# Validate, sim, report and replay

[Run the examples gallery](gallery.md) · [Open the interactive playground](playground.md)

## Bounded seeded journey

Start with the [first journey](getting-started.md#first-journey), a prepared package and new output paths:

```sh
pokie validate demo-package
pokie sim demo-package --rounds 100 --workers 1 --seed first-journey --format json --out simulation.json
pokie report simulation.json --format markdown --out simulation.md
pokie replay demo-package --seed first-journey --round 10 --out replay.json
```

**Validate** checks structure/contracts, not mathematical certification. **Sim** empirically samples its declared population; inspect actual rounds, modes, seeds, workers, warnings and confidence/convergence information. Rare or unseen events and zero empirical variance do not prove impossibility. Exact analysis instead enumerates a supported finite population within explicit budgets; exhausted/unknown is not an exact proof. **Report** renders retained data; it does not rerun or improve evidence. Seed replay for arbitrary packages is best effort unless random initialization, custom state and dependencies satisfy the executable contract.

Do not compare runs with different artifacts, modes, worker counts or RNG initialization as the same stream. Changing worker count changes seed streams. [Simulation contracts](../../docs/simulation.md) and [round artifacts](../../docs/round-artifacts.md).

## Audit replay

```sh
pokie replay COMPATIBLE_PACKAGE --recording audit-round.json
```

An executable `pokie.audit-round.v1` recording carries compatibility identity, state, commands and evidence. Verification uses the same runtime without a live wallet or session. It requires compatible executable bytes/dependencies, complete custom state codecs and seeded RNG continuation. A public visible result or presentation DTO cannot restore hidden future state. Live-only sessions cannot claim durable restoration or exact audit replay. Mismatch is a failure to investigate; it is not fixed by relabelling the artifact.

## Canonical WASM replay

Canonical WASM has a portable replay path: use the **same explicit seed** for `run`, `sim` and `replay`, whose defaults differ. For WASM simulation use `--workers 1`, fixed rounds and no adaptive convergence.

Simulation and replay accept `--mode <id>` only when the component declares that bet mode. Unknown IDs fail; ordinary components without declared modes reject mode selection. `sim --mode all` requires declared modes and runs the full `--rounds` budget independently for each mode, starting each with the same seed; it produces separate mode reports.

Replay defaults to `--unit step`: `--round N` addresses N accepted mathematical plays, excluding delivery-only frames. Feature-aware components also support `--unit logical-round` to complete N logical entries, optionally with a declared `--mode <id>`. Mode selection applies at entries; pending feature continuations keep their entry selection. Ordinary components reject logical-round addressing. `all` is a simulation selector, not a replay mode.

Native library simulation/replay requires a declared `--mode` and explicit seed; its authority is the library distribution.

## RNG choices

Default `PseudorandomNumberGenerator` uses **Math.random()**. `SeededRandomNumberGenerator` is deterministic and reproducible, not cryptographically secure. `SecureRandomNumberGenerator` is a stronger entropy primitive using Node crypto. Neither determinism nor stronger entropy establishes independent RNG certification. A seeded generator must be injected into both initialization and subsequent execution where the composition consumes random draws.

## Dossier preparation

V2C-27's canonical dossier reuses model readers, statistics and executable audit replay. Build an outcome-library source through a supported conversion, then select explicit evidence authorities. A minimal configuration is:

```json
{
  "modes": [{"modeName": "base", "seed": "assessment-base", "sampleCount": 100}],
  "output": {"formats": ["json", "console", "markdown", "html", "pdf"]}
}
```

```sh
pokie certification build sources/outcome-library dossier-config.json --out assessment
pokie certification verify assessment --source sources/outcome-library
pokie report assessment/manifest.json --format html --out assessment-copy.html
```

Use a new output directory. Add `dossier.modelSource`, `reportFiles`, `replayFiles`, `sourceRevision` and `candidateRevision` when those authorities exist. Configuration paths are relative to the config file; relocated verification requires explicit `--authorities` and custom presentation requires `--template`. Inspect each section's unavailable/partial findings rather than supplying labels as proof. Changed bytes or authorities require regeneration, not reuse of stale evidence.

Formats are JSON, console text, Markdown, HTML and a local selectable-text PDF. **YAML is unimplemented**. Outcome-only evidence cannot establish originating model rules. Partial/custom/unknown authority stays visible; SDK/fairness evidence is explicitly unavailable in this dossier format. Integrity, fairness proofs and SDK compatibility are not certification. See the [complete dossier contract and relocation configuration](../../docs/certification-evidence-bundle.md) and [compliance boundary](server.md).

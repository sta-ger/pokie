[← Back to docs index](README.md)

# Glossary

This page explains the words POKIE uses. If a term is missing, the page that introduces it should define it.

## The seven objects

- **Game design (Blueprint)** — the JSON file where you describe the game: symbols, reels, paytable,
  paylines and features.
- **Project** — a folder POKIE can open. It can contain a game design, a game package, an outcome
  library, a PAR workbook or a WASM build.
- **Game package** — a runnable package built from a game design.
- **Outcome table (technical alias: Outcome Library)** — a table of every possible outcome of one paid entry spin, with its probability. When a game has free games or another later-settling feature, that feature's payouts are not rows in this table; they are derived separately (for example **Derived total**) or estimated with Simulation. Studio's main UI says outcome table; the canonical object name remains Outcome Library in the API and docs.
- **Round record** — a saved description of one completed round: screen, wins, steps and, when captured,
  enough information to audit-replay it or to run a seeded forward replay. Not every record carries a
  seed; see **Audit replay** and **Seed replay** below.
- **Simulation report** — the result of running many rounds: RTP, hit frequency, volatility, payout
  buckets and confidence intervals.
- **Certification pack** — the evidence folder prepared for an auditor.

## Studio terms

- **Game design** — Studio's saved-design view: the layout, symbols, reels, paytable, bets and mechanics
  of the current game design. It is the same design, not a second model or a separate file. Older
  bookmarks and API notes may still call this view **Game Model**.
- **Blueprint** — another name for a **game design**, used mainly in file paths and the CLI. Studio's
  main path says **game design**; `blueprint.json` is the editable source file.
- **Structure check** — the automatic check that a game design is well formed: required fields,
  references and supported shapes. A structure-valid design can still have unbalanced math.
- **Math check** — the separate work of checking RTP, payout distribution, volatility and feature
  termination. Exact math and Simulation are math checks; neither is a certification.
- **Structural demo** — a starter whose layout and paytable form a valid, playable model but whose
  math is not tuned for the selected win model. The Ways and Clusters starter variants are structural
  demos: they keep the line paytable until you retune it.
- **Design version (source revision)** — the saved snapshot a simulation report was produced from.
  Older reports may not record one; the run list omits that suffix when it is unknown.
- **Exact math** — a complete enumeration of every paid-spin outcome and its weight. Exact for the
  paid-spin model; it is not a sample and does not estimate.
- **Coverage** — what a result's weights actually count. **Exact coverage** means every reachable
  outcome was enumerated. **Sampled coverage** (also called capped coverage) means a deterministic
  sample was drawn from a larger space; its RTP and probabilities are estimates, not exact game math.
  **Coverage metadata unavailable** means the source does not record which case applies.
- **Outcome analysis** — the weighted report computed from an outcome library's own retained weights.
  It is exact over those weights, but it is not automatically the whole game: feature payouts that
  settle in later rounds are outside a paid-entry library.
- **Paid-spin RTP** — RTP from the paid entry spin only. Feature wins that settle later (for example
  free-game wins) are not part of this figure.
- **Whole-round RTP** — RTP that also includes feature wins and retriggers. When a game has free games,
  this is the number a player experiences over full rounds.
- **Derived total** — a whole-round RTP derived from an exact paid-spin library plus an exact feature
  model (for example additive free games), rather than sampled. The derivation is shown with its
  assumptions.
- **Additive retrigger** — a free-games rule where each retrigger adds its award to the remaining free
  games. Exact whole-round RTP for this rule uses the trigger probability, the average award and the
  resulting geometric series.
- **Retrigger factor** — trigger probability × average award: the expected number of retrigger awards
  per free spin. Without a cap, a factor below 1 makes the additive retrigger series converge; a factor
  of 1 or more makes expected free games (and exact total RTP under this model) unbounded.
- **Free-games cap (`maxFreeGames`)** — an optional hard limit on the total free games in one feature,
  including the trigger award and every retrigger. A cap makes feature termination provable even when
  the retrigger factor is 1 or higher.
- **Payout bucket** — a range of payout multiples (× bet) used to summarize a simulation. Buckets are
  half-open `[a, b)`: `[1, 2)` includes 1 and excludes 2; the first positive bucket is `(0, 1)`.

## Slot terms

- **RTP (Return to Player)** — the share of all wagers a game returns over time. An RTP of 96% means,
  on average, 96 credits return for every 100 wagered.
- **Volatility** — the shape of the payout distribution. Low volatility means frequent, smaller wins;
  high volatility means rarer, bigger wins. When a report says **Volatility (std. deviation, bet units)**,
  it is giving the quantitative measure: the standard deviation of payout per paid round.
- **Hit frequency** — the share of sampled units that produce any win. Reports label the unit: **Hit
  frequency (paid spins)** excludes wins that settle only in free games, while **Hit frequency — whole
  paid round, incl. features** counts the whole round. The two are not interchangeable when features exist.
- **Max win** — the largest payout a game can produce, usually expressed as a multiple of the bet. Exact
  math reports the theoretical **paid-spin** maximum. With a capped free-games feature, Studio also
  reports a **max whole-round win (upper bound, capped)**: the paid-spin maximum plus the cap in free
  spins, each at the paid-spin maximum. Without a cap, retriggers can chain indefinitely and the
  theoretical whole-round maximum is unbounded, even when expected RTP is finite. In Simulation,
  **Largest observed win** is only the maximum seen in that sample, so it is a lower bound on the
  theoretical maximum, not a replacement for it. Studio does not apply a separate cap on the payout
  itself: the free-games cap limits the number of feature spins, not the size of a win. If a market
  requires a max-win cap, apply that rule in the game integration and re-check the math; the upper
  bound shown in Studio is not a market cap.
- **Reel / reel strip** — one spinning column and the ordered symbols it contains.
- **Stop position** — the index on a reel strip where the visible window starts.
- **Payline** — a fixed line across the reels that pays matching symbols.
- **Ways** — a win rule that pays matching symbols on adjacent reels without fixed lines.
- **Cluster** — a win rule that pays a connected group of matching symbols.
- **Scatter** — a symbol that pays or triggers a feature regardless of position.
- **Wild** — a symbol that substitutes for other symbols.
- **Paytable** — the table of symbol payouts.
- **Spin** — one paid or free spin. Simulation's **Spins** budget counts paid and free spins, so a
  game with free games can complete fewer paid rounds than the spin budget. The runtime API's
  `mathematicalCursor` counts settled spins inside a paid round.
- **Accepted spin (API)** — a spin the run actually accepted and counted. It is the budget unit; RTP
  confidence intervals use **completed paid rounds** as their sample count, because several accepted
  spins can belong to one paid round. Studio's main UI says **spins (paid + free)**; the persisted field
  remains `acceptedSubrounds`.
- **Paid round** — one paid entry plus every spin and feature it triggers; the same object as a
  **Logical round**, and the sample unit for whole-round RTP, hit frequency, volatility and max win.
- **Logical round** — one paid entry plus everything it triggers, including free games and cascades. It
  can contain several spins and several screens.
- **Subround (internal)** — the runtime/schema term for one accepted spin or screen. Studio and
  user-facing reports say **spin**, **free spin** or **paid round** as appropriate; `subround` appears
  only in API and persistence fields where the exact runtime identity matters.
- **Screen** — one delivered view of a round after a spin or cascade step. The runtime API's
  `cursor` (delivery cursor) counts these.
- **PAR sheet** — the standard slot-math spreadsheet used to exchange paytable and reel data.
- **Bet mode** — a named way to play, such as base, ante or buy-feature.
- **Ante bet** — a higher base bet that improves the chance of triggering a feature.
- **Buy feature** — paying a fixed price to enter a bonus feature directly.
- **Free games** — bonus spins that do not cost the player.
- **Hold & Win / Lock & Spin** — a respin feature that locks symbol values and collects them.
- **Respin** — an extra spin awarded by a feature.
- **Cascades** — a win removes its symbols and refills the grid; the round continues until no new win
  appears or the configured maximum number of cascades is reached.
- **Collection feature** — the chosen symbol adds to a counter on each accepted spin; reaching the
  threshold pays an award and resets or subtracts the threshold.
- **Weighted bonus outcomes** — when a bonus trigger occurs, one outcome is drawn in proportion to its
  weight. An outcome can pay immediately and start a bonus of a set length.
- **Whole-sequence variants** — alternative complete reel sequences, each with a weight; the engine
  chooses one before a spin. This is an advanced alternative to literal strips or per-symbol weights.
- **Screen modifier** — a rule that changes symbols or adds wilds after the reels stop. Rules run in
  order, and wild multipliers apply to the wins they affect. A sticky wild stays for a configured
  number of spins and counts down once per spin.
- **Jackpot** — a fixed, local or progressive prize pool.
- **Multiplier** — a factor applied to a win.
- **Retrigger** — a feature that awards more free games while it is running.
- **RGS (Remote Game Server)** — the operator-side system that serves games to players. POKIE is not an
  RGS.
- **Provably fair** — a scheme where a player can verify that a round was not changed after the fact.
- **Commit-reveal** — publishing a hash of a secret before the round, then revealing the secret after it.
- **Seed** — the starting value of a random number generator.
- **RNG** — random number generator.
- **Monte Carlo** — estimating a result by running many random trials instead of listing every outcome.
- **Confidence interval** — the range around an estimate that is likely to contain the true value.

## Build and file terms

- **Build output** — a file or folder produced by `pokie build`.
- **Output format** — the kind of build output: TypeScript package, outcome library, Stake Engine export,
  PAR workbook or WASM build.
- **Package info** — the data that identifies a package, such as its name, version and entry point.
- **Index** — a small file that lists the parts of a larger folder.
- **Companion file** — a small file next to a main file that describes or validates it.
- **Hash** — a short fingerprint of a file's contents.
- **Canonical JSON** — JSON with sorted keys and a fixed byte layout, so the same content always hashes
  the same. This is the one place where the word *canonical* has a precise meaning.
- **Schema** — the versioned shape of a JSON file.
- **ESM** — ECMAScript modules, the standard JavaScript module format.
- **WASM** — WebAssembly, a portable binary format.

## Audit terms

- **Provenance** — where a piece of data came from.
- **Evidence** — the files and records an auditor reviews.
- **Attestation** — a signed statement.
- **Integrity** — the data has not changed since it was recorded.
- **Verification** — checking that a certification pack still matches its source and its hashes.
- **Audit replay** — replaying the exact commands captured in a recorded audit. It does not need the
  original seed, and it verifies that the recorded operation can be re-executed.
- **Seed replay** — starting a fresh session from the recorded seed and playing forward to the target
  round. This is a different guarantee from audit replay; it is unavailable when no seed was recorded.

## Words we avoid in the main UI

These words are still used in the API reference where they are precise. In Studio, CLI help and guides,
use the right-hand column.

| Avoid | Use |
|---|---|
| artifact (build) | build output |
| round artifact | round record |
| certification evidence dossier | certification pack |
| dossier | certification pack |
| evidence bundle | certification pack |
| manifest (game design) | info |
| manifest (file) | package info / index |
| bundle | folder / pack |
| provenance | origin |
| materialize | create / write / prepare |
| projection | view / export |
| binding | link |
| capability | supported action |
| lifecycle | status |
| contract | interface / format |
| adapter | connector |
| preflight | check |
| step (logical round) | spin / screen |
| part (delivery) | screen |
| idempotent | safe to retry |
| canonical (as filler) | delete the word |

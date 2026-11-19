[← Back to docs index](README.md)

# Glossary

This page explains the words POKIE uses. If a term is missing, the page that introduces it should define it.

## The seven objects

- **Game design (Blueprint)** — the JSON file where you describe the game: symbols, reels, paytable,
  paylines and features.
- **Project** — a folder POKIE can open. It can contain a game design, a game package, an outcome
  library, a PAR workbook or a WASM build.
- **Game package** — a runnable package built from a game design.
- **Outcome library** — a table of every possible round outcome and how often it occurs.
- **Round record** — a saved description of one completed round: screen, wins, steps and enough
  information to replay it.
- **Simulation report** — the result of running many rounds: RTP, hit frequency, volatility, payout
  buckets and confidence intervals.
- **Certification pack** — the evidence folder prepared for an auditor.

## Slot terms

- **RTP (Return to Player)** — the share of all wagers a game returns over time. An RTP of 96% means,
  on average, 96 credits return for every 100 wagered.
- **Volatility** — the shape of the payout distribution. Low volatility means frequent, smaller wins;
  high volatility means rarer, bigger wins.
- **Hit frequency** — the share of rounds that produce any win.
- **Max win** — the largest payout a game can produce, usually expressed as a multiple of the bet.
- **Reel / reel strip** — one spinning column and the ordered symbols it contains.
- **Stop position** — the index on a reel strip where the visible window starts.
- **Payline** — a fixed line across the reels that pays matching symbols.
- **Ways** — a win rule that pays matching symbols on adjacent reels without fixed lines.
- **Cluster** — a win rule that pays a connected group of matching symbols.
- **Scatter** — a symbol that pays or triggers a feature regardless of position.
- **Wild** — a symbol that substitutes for other symbols.
- **Paytable** — the table of symbol payouts.
- **PAR sheet** — the standard slot-math spreadsheet used to exchange paytable and reel data.
- **Bet mode** — a named way to play, such as base, ante or buy-feature.
- **Ante bet** — a higher base bet that improves the chance of triggering a feature.
- **Buy feature** — paying a fixed price to enter a bonus feature directly.
- **Free games** — bonus spins that do not cost the player.
- **Hold & Win / Lock & Spin** — a respin feature that locks symbol values and collects them.
- **Respin** — an extra spin awarded by a feature.
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

## Words we avoid in the main UI

These words are still used in the API reference where they are precise. In Studio, CLI help and guides,
use the right-hand column.

| Avoid | Use |
|---|---|
| artifact (build) | build output |
| round record | round record |
| certification evidence dossier | certification pack |
| dossier | certification pack |
| evidence bundle | certification pack |
| manifest | package info / index |
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
| idempotent | safe to retry |
| canonical (as filler) | delete the word |

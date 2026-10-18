# Server and compliance boundaries

## Local adapters

```sh
pokie serve PACKAGE
pokie client PACKAGE
# Or start both for development:
pokie dev PACKAGE
```

Use a prepared package with the declared local adapter capability; inspect `pokie serve --help` / `client --help` for host/port options. `serve` exposes reference local HTTP sessions/spins, `client` serves player presentation for a running server, and `dev` combines them. These are local/development tools, distinct from this static public site and Studio's in-process Play. Canonical WASM has no serve capability. [Local server](../../src/server/PokieDevServer.ts) and [adapter SDK](../../docs/external-adapter-sdk.md).

## Settlement guarantees

The [architecture](architecture.md#state-and-persistence) separates executable state, storage and wallet authority. Reference in-memory wallets are process-scoped. A file session repository alone does not persist the wallet, round results, idempotency keys or operation log atomically. Use an explicit `TransactionalRoundStore` contract where atomic local settlement is required; SQLite is its reference implementation, not a guarantee for unrelated ports.

External-wallet reconciliation uses durable **local outbox/provider** contracts with verified capabilities. `ExternalRoundStore` / `SqliteExternalRoundStore` retain local evidence and recovery state. Provider idempotency/reconciliation behavior must satisfy its declared contract; this is **not distributed ACID**. A reference adapter, process-only Studio Play or weaker outcome-source settlement does not acquire those guarantees merely by sharing result DTOs. [External storage](../../src/server/storage/ExternalRoundStore.ts), [SQLite external store](../../src/server/storage/SqliteExternalRoundStore.ts), [reconciliation](../../src/server/spin/SpinReconciliationService.ts).

Drain cancellation and reconciliation work before closing owned stores, loaded games and runtime leases. Inspect operation-specific recovery instructions after interrupted work instead of resubmitting a spin or assuming that a saved session means a settled wallet.

## What remains outside POKIE

POKIE is an ISC-licensed math/runtime/tooling project. It does not supply accounts, KYC, compliance approval, independent RNG certification or production RGS integration. It is not a ready casino backend. Adapter SDK compatibility is a technical contract, not operator approval.

Default RNG is Math.random-based; deterministic seeded RNG is for reproducibility; Node crypto-backed secure RNG is a stronger primitive. None establishes regulatory certification. Commit/reveal [fairness proofs](../../docs/provably-fair.md) establish their stated outcome-library proof only. [Dossier preparation](reproducibility.md#dossier-preparation) assembles evidence and unavailable/partial sections; it does not confer certification, correctness or authenticity.

## License

ISC License. Copyright (c) 2018-2026, sta-ger. Keep the copyright and permission notice in copies. The software is provided AS IS without warranty. The site's download preserves the [actual unmodified LICENSE](../../LICENSE).

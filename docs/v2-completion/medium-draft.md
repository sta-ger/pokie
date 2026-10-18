# Medium draft — UNPUBLISHED

Editorial review pending. Separate explicit posting authorization, verified author/publication access and final content approval are required. Candidate package/site availability is unverified. This document is not a published article.

## Reproducible game math with POKIE 2.0

POKIE starts with ISC-licensed game math and a headless JavaScript/TypeScript runtime. CLI and local Studio put authoring, inspection, simulation, replay and artifact preparation around that runtime. The intended audience is math authors and developers who need to understand and reproduce a model before integrating it.

`pokie` opens Studio Home; `pokie <project>` opens a Project. `create` authors an editable Blueprint, `init` prepares a code-first TypeScript package, and `build SOURCE --target TARGET` owns supported artifact conversions. New artifacts use new/empty destinations. Edits and optimization candidates require explicit save/apply. This makes the difference between an experiment and a changed source observable.

## Know the supported slice

The maintained [authored-workflow catalog](../../src/generated/AuthoredWorkflowSupportCatalog.ts), [compatibility catalog](../../src/generated/GameMechanicCompatibilityCatalog.ts) and [support register](launch-mechanics-support.md) define composition/target limits. For example, free games and Hold & Win cannot be composed together; arbitrary TypeScript behavior is not compiled to WASM. Implementation coverage, historical execution and independent acceptance remain distinct. Neither a feature listing nor an old successful run establishes current acceptance. Independent editorial and candidate review remain pending.

The local gallery/playground and executable examples use bounded work and supported inputs. Seed, model/artifact hashes and runtime provenance make their results inspectable. A version change requires new WASM descriptors, package bytes and hashes. To evaluate the candidate, obtain a controller-produced local archive or build the source checkout. pokie.fromstan.com remains a future deployment target; this draft does not establish a live service, registry release or account ownership.

## Runtime evidence has boundaries

The default Math.random RNG is separate from seeded reproducibility and crypto-backed primitives. Commit/reveal fairness proofs bind a specific supported outcome workflow. Dossier preparation collects model-bound evidence; simulation, structural validation, technical SDK compatibility and dossier generation do not establish regulatory certification or independent RNG certification. See [fairness](../provably-fair.md), [dossiers](../certification-evidence-bundle.md) and [external adapter SDK](../external-adapter-sdk.md).

Reference server adapters and local development tools are separate from production operator infrastructure. Accounts, KYC, regulatory compliance and production RGS integration are outside POKIE. Transactional local storage has a specific local commit boundary; external-wallet outbox/reconciliation contracts expose recovery obligations. They do not promise distributed ACID. Session persistence alone is not a durable wallet. Process-only Studio Play offers no production settlement guarantee; operators must design and verify their integrations.

## Evaluate locally, authorize separately

[Release preparation](release-preparation.md) separates planned, built, verified and published states. Package acceptance, repository transfer, DNS/account/hosting changes, deployment and each social post need separate owners, access and explicit authorization. Historical engineering receipts are not public release approval.

POKIE is ISC-licensed, with attribution and AS-IS terms in LICENSE. No managed hosting, commercial support or service-level commitments are provided. The useful next step is a bounded local experiment against the maintained support contract, followed by independent assessment of the evidence.

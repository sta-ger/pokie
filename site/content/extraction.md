# Package extraction

Extraction is an explicit artifact conversion from a code-first package's declared effective model. Opening a custom package does not convert or rewrite it.

## Preview and save

Prerequisite: a loadable package implementing a complete public model descriptor, including every supported authored field needed for reconstruction. Partial, unknown and unsupported fields produce diagnostics.

```sh
pokie build PACKAGE --target blueprint --dry-run
pokie build PACKAGE --target blueprint --out extracted.blueprint.json
pokie validate extracted.blueprint.json
pokie extracted.blueprint.json
```

Inspect the first command's completeness and unsupported diagnostics. Only complete supported models can be saved. Successful explicit save creates `extracted.blueprint.json` and its `.conversion-evidence.json` companion, both at new paths. Retain both when reviewing the conversion. New-file conflicts, incomplete models and unsupported compositions require correction or another destination; dry-run never authorizes an overwrite.

## Studio path

Open the package, go to **Build/Export**, choose Blueprint and preview. Review the model and conversion evidence, select a new destination, then **Save Blueprint**. **Open as Project** opens the saved editable model; the original package remains code-first. Saving the extracted model and later saving edits are separate actions.

## Equivalence limits

The descriptor states model authority. A complete descriptor is not a proof that arbitrary executable code has no hidden services, state, timing or different RNG use. Finite seeded comparisons can find mismatches but cannot prove arbitrary executable equivalence. Conversion evidence preserves source identity, declared support and diagnostics, not certification. Native outcome artifacts cannot reconstruct an originating authored model.

[Extraction implementation](../../src/generated/PackageBlueprintExtraction.ts) · [Declared workflow support](../../src/generated/AuthoredWorkflowSupportCatalog.ts) · [Package contract](../../docs/game-packages.md)

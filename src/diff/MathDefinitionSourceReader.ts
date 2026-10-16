import {validateMathDefinitionSnapshot} from "../validation/validateMathDefinitionSnapshot.js";
import {definitionDiagnostics} from "./internal/definitionDiagnostics.js";
import {definitionFieldAuthority, definitionFieldUnsupported} from "./internal/definitionFieldAuthority.js";
import fs from "fs";
import {modelFieldPathContains, modelFieldPathSegments} from "../generated/internal/modelFieldPath.js";
import {computeGameBlueprintHash} from "../generated/computeGameBlueprintHash.js";
import {validateMathDefinitionMaxWinPolicy} from "./validateMathDefinitionMaxWinPolicy.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import {
    detachPackageModelData,
    PackageBlueprintExtraction,
    type PackageBlueprintExtractionResult,
    type PackageBlueprintExtracting,
} from "../generated/PackageBlueprintExtraction.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {GameBlueprintReadBudgetExceededError, loadGameBlueprint} from "../generated/loadGameBlueprint.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import {materializeReelStrips} from "../generated/materializeReelStrips.js";
import {ParSheetImporter} from "../parsheet/ParSheetImporter.js";
import type {PokieProject} from "../project/PokieProject.js";
import {ProjectTargetResolver} from "../project/ProjectTargetResolver.js";
import {readWasmComponentManifest} from "../project/readWasmComponentManifest.js";
import type {
    DefinitionJson,
    MathDefinitionBlueprintInput,
    MathDefinitionDiagnostic,
    MathDefinitionMaxWinPolicy,
    MathDefinitionSnapshot,
} from "./MathDefinitionDiff.js";
import {MathDefinitionDiffer} from "./MathDefinitionDiffer.js";

export type MathDefinitionInput = string | PokieProject | PokieGame | MathDefinitionBlueprintInput;
export interface MathDefinitionSourceReading {
    read(input: MathDefinitionInput, options?: {signal?: AbortSignal; analysisOnly?: boolean; maxSourceBytes?: number}): Promise<MathDefinitionSnapshot>;
}
function diagnostic(
    code: string,
    message: string,
    severity: MathDefinitionDiagnostic["severity"] = "error",
    path = "",
): MathDefinitionDiagnostic {
    return {code, message: message.slice(0, 2000), severity, path};
}
function effectiveDefaults(model: Partial<GameBlueprint>, fields: PackageBlueprintExtractionResult["fields"]): Record<string, unknown> {
    const result = {...model} as Record<string, unknown>;
    for (const key of ["wilds", "scatters", "betModes"]) if (result[key] === undefined) result[key] = [];
    result.mechanics ??= {};
    result.availableBets ??= [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100];
    result.winModel ??= {type: "lines"};
    if (model.winModel?.type === "clusters") result.winModel = {minimumClusterSize: 5, ...model.winModel};
    if (model.reels && model.rows) result.screenGeometry ??= {
        generated: {reels: model.reels, rows: model.rows},
        visible: {rowOffset: 0, rows: model.rows},
        evaluated: {rowOffset: 0, rows: model.rows},
        paylineSpace: "evaluated",
    };
    if (model.reels && model.rows) result.paylines ??= Array.from({length: model.screenGeometry?.evaluated.rows ?? model.rows}, (_, row) =>
        Array.from({length: model.reels!}, () => row),
    );
    if (model.mechanics?.freeGames) result.mechanics = {...model.mechanics, freeGames: {retriggerPolicy: "additive", ...model.mechanics.freeGames}};
    if (model.betModes) result.betModes = model.betModes.map((mode) => ({costMultiplier: 1, isDefault: false, ...mode}));
    if (model.mechanics?.modifiers && Array.isArray(model.mechanics.modifiers.wilds)) result.mechanics = {
        ...(result.mechanics as object),
        modifiers: {
            ...model.mechanics.modifiers,
            wilds: model.mechanics.modifiers.wilds.map((wild) => ({factor: 1, ...wild})),
        },
    };
    if (["winModel", "screenGeometry"].some(dependency => definitionFieldUnsupported(fields, [dependency]))) {
        // Horizontal lines also depend on a known evaluator and evaluated geometry.
        if (model.paylines === undefined) Reflect.deleteProperty(result, "paylines");
    }
    return result;
}

// Retain declarations, but never fill an unknown collaborator with generated-runtime behavior.
function filterDefaults(authored: unknown, effective: unknown, keys: string[], fields: PackageBlueprintExtractionResult["fields"]): unknown {
    if (definitionFieldAuthority(fields, keys)?.status === "unsupported") return authored;
    if (authored === undefined && definitionFieldUnsupported(fields, keys) && Array.isArray(effective)) return undefined;
    if (Array.isArray(effective)) return effective.map((value, index) =>
        filterDefaults(Array.isArray(authored) ? authored[index] : undefined, value, [...keys, String(index)], fields));
    if (effective !== null && typeof effective === "object") return Object.fromEntries(
        Object.entries(effective).map(([key, value]) => [key,
            filterDefaults(authored && typeof authored === "object" ? Reflect.get(authored, key) : undefined, value, [...keys, key], fields),
        ]).filter(([, value]) => value !== undefined),
    );
    return effective;
}

/** Authoritative server-side readers. Outcome artifacts deliberately have no inverse model reader. */
export class MathDefinitionSourceReader implements MathDefinitionSourceReading {
    private readonly extraction: PackageBlueprintExtracting;

    constructor(extraction: PackageBlueprintExtracting = new PackageBlueprintExtraction()) {
        this.extraction = extraction;
    }

    /** Reading a definition is an explicit analysis boundary; extraction/build callers never enter here. */
    public async read(input: MathDefinitionInput, options?: {signal?: AbortSignal; analysisOnly?: boolean; maxSourceBytes?: number}): Promise<MathDefinitionSnapshot> {
        const snapshot = await this.readDefinition(input, options);
        if (!options?.analysisOnly) snapshot.advanced = await validateMathDefinitionSnapshot(snapshot, options);
        return snapshot;
    }

    private async readDefinition(input: MathDefinitionInput, options?: {signal?: AbortSignal; analysisOnly?: boolean; maxSourceBytes?: number}): Promise<MathDefinitionSnapshot> {
        const snapshot: MathDefinitionSnapshot = {
            identity: {kind: "unknown"},
            support: "unsupported",
            fields: [],
            diagnostics: [],
            limits: [],
        };
        const check = (): void => {
            if (options?.signal?.aborted) throw new Error("Definition comparison cancelled");
        };
        try {
            if (typeof input === "string") snapshot.identity = {kind: "unknown", location: input};
            check();
            if (typeof input === "string" && input.endsWith(".json") && fs.statSync(input).isFile()) return await this.blueprint(
                {
                    kind: "blueprint",
                    location: input,
                    model: loadGameBlueprint(input, {preserveInvalidAuthoredContent: true, maxBytes: options?.maxSourceBytes ?? 400000}),
                },
                options,
            );
            if (typeof input === "string") snapshot.identity = {kind: "unknown", location: input};
            if (typeof input === "string" || ("type" in input && "rootPath" in input)) {
                const project =
                    typeof input === "string"
                        ? await new ProjectTargetResolver().resolve(input, {readConfigurationProvenance: false})
                        : input;
                check();
                if (!project) {
                    // The validator must retain malformed authored fields instead of a resolver hiding
                    // them. Explicit definition reads of JSON always go through the Blueprint reader.
                    if (typeof input === "string" && input.endsWith(".json")) return await this.blueprint(
                        {
                            kind: "blueprint",
                            location: input,
                            model: loadGameBlueprint(input, {preserveInvalidAuthoredContent: true, maxBytes: options?.maxSourceBytes ?? 400000}),
                        },
                        options,
                    );
                    throw new Error(
                        "No definition source recognized; choose a Blueprint, package, PAR or canonical WASM input.",
                    );
                }
                snapshot.identity = {kind: project.type, location: project.rootPath};
                switch (project.type) {
                    case "blueprint":
                        return await this.blueprint(
                            {
                                kind: "blueprint",
                                location: project.rootPath,
                                model: loadGameBlueprint(project.rootPath, {preserveInvalidAuthoredContent: true, maxBytes: options?.maxSourceBytes ?? 400000}),
                            },
                            options,
                        );
                    case "tsPackage":
                        return this.fromExtraction(
                            await this.extraction.extract(project.rootPath, options),
                            snapshot.identity,
                        );
                    case "parWorkbook": {
                        const imported = await new ParSheetImporter().importFromFile(project.rootPath);
                        check();
                        const result = await this.blueprint(
                            {kind: "blueprint", location: project.rootPath, model: imported.blueprint},
                            options,
                        );
                        result.identity.kind = "parWorkbook";
                        result.diagnostics.push(
                            ...imported.issues.map((issue) => ({
                                code: issue.code,
                                severity: issue.severity,
                                message: issue.message,
                                path: issue.path ?? "",
                            })),
                        );
                        result.limits.push(
                            "PAR comparison covers imported representable fields; unknown cells and defaults are recorded by the importer.",
                        );
                        result.diagnostics = definitionDiagnostics(result.diagnostics);
                        if (imported.issues.some((issue) => issue.severity === "error")) result.support = "invalid";
                        else if (imported.conversionEvidence?.losslessEligible === false) result.support = "partial";
                        return result;
                    }
                    case "wasm": {
                        const read = await readWasmComponentManifest(project);
                        check();
                        if (!read.supported || !read.canonical) {
                            snapshot.diagnostics.push(
                                diagnostic(
                                    "wasm-definition-unavailable",
                                    "Legacy WASM metadata cannot establish a canonical definition.",
                                    "warning",
                                ),
                            );
                            return snapshot;
                        }
                        const {schemaVersion: _schema, stopWidths, ...model} = read.canonical.model;
                        const result = await this.blueprint(
                            {
                                kind: "blueprint",
                                location: project.rootPath,
                                model: {
                                    ...model,
                                    symbols: [
                                        ...new Set([
                                            ...model.reelStrips.flat(),
                                            ...Object.keys(model.paytable),
                                            ...(model.wilds ?? []),
                                            ...(model.scatters ?? []),
                                        ]),
                                    ],
                                    manifest: {
                                        id: read.manifest.component.id,
                                        name: read.manifest.component.id,
                                        version: read.manifest.component.version,
                                    },
                                },
                            },
                            options,
                        );
                        result.identity.kind = "wasm";
                        // Canonical WASM retains its exact sampling widths, but not discarded
                        // authoring tables/symbol inventory. Never claim full cross-format equality.
                        result.effective = {
                            ...(result.effective as Record<string, DefinitionJson>),
                            stopWidths: [...stopWidths],
                        };
                        if (result.effective && typeof result.effective === "object") Reflect.deleteProperty(result.effective, "symbols");
                        if (result.authored && typeof result.authored === "object") Reflect.deleteProperty(result.authored, "symbols");
                        result.fields = result.fields.filter(
                            (field) => !modelFieldPathContains(["symbols"], modelFieldPathSegments(field.path) ?? []),
                        );
                        result.fields.push({
                            path: "symbols",
                            status: "unsupported",
                            authority: "Canonical WASM does not retain an authored symbol inventory",
                        });
                        result.support = result.support === "complete" ? "partial" : result.support;
                        result.limits.push(
                            "Canonical WASM contains effective strips, stop widths and payouts; original symbol inventory and authored omissions are unavailable.",
                        );
                        return result;
                    }
                    default:
                        snapshot.diagnostics.push(
                            diagnostic(
                                "outcome-only-definition-unavailable",
                                "Outcome artifacts support aggregate-analysis diff, not reconstruction of an originating definition.",
                                "warning",
                            ),
                        );
                        return snapshot;
                }
            }
            if ("kind" in input && input.kind === "blueprint") return await this.blueprint(input, options);
            return this.fromExtraction(await this.extraction.extract(input as PokieGame, options), {kind: "package"});
        } catch (error) {
            const malformedJson =
                error instanceof Error &&
                (error.message.startsWith("Could not parse") || error.message.includes("must contain a JSON object"));
            if (error instanceof GameBlueprintReadBudgetExceededError) {
                snapshot.support = "unsupported";
                snapshot.limits.push(error.message);
                snapshot.diagnostics.push(diagnostic("definition-acquisition-budget-exhausted", error.message, "warning"));
                return snapshot;
            }
            snapshot.support = options?.signal?.aborted ? "cancelled" : "failed";
            if (!options?.signal?.aborted && malformedJson) snapshot.support = "invalid";
            snapshot.diagnostics.push(
                diagnostic(
                    snapshot.support === "cancelled" ? "comparison-cancelled" : "definition-read-failed",
                    error instanceof Error ? error.message : String(error),
                ),
            );
            return snapshot;
        }
    }

    private async blueprint(
        input: MathDefinitionBlueprintInput,
        options?: {signal?: AbortSignal; analysisOnly?: boolean; maxSourceBytes?: number},
    ): Promise<MathDefinitionSnapshot> {
        const snapshot: MathDefinitionSnapshot = {
            identity: {kind: "blueprint", ...(input.location ? {location: input.location} : {})},
            support: "complete",
            fields: [],
            diagnostics: [],
            limits: [],
        };
        try {
            const authored = detachPackageModelData(input.model) as GameBlueprint;
            snapshot.authored = authored as unknown as DefinitionJson;
            snapshot.identity.revision = computeGameBlueprintHash(authored);
            if (options?.analysisOnly) {
                const policy = input.maxWinPolicy ?? {type: "none" as const, scope: "logical-round" as const, authority: "Blueprint runtime has no payout cap"};
                snapshot.effective = {...authored, maxWinPolicy: policy} as unknown as DefinitionJson;
                return snapshot;
            }
            const symbols = Array.isArray(authored.symbols) ? authored.symbols.length : 0;
            const bets = Array.isArray(authored.availableBets) ? authored.availableBets.length : 11;
            let preprocessing = symbols ** 2 + symbols * (Number.isSafeInteger(authored.reels) && authored.reels > 0 ? authored.reels : 1) * bets;
            for (const reel of Array.isArray(authored.reelStripGeneration) ? authored.reelStripGeneration : []) if (reel && reel.type === "generated" && Number.isSafeInteger(reel.length) && reel.length > 0 && (reel.maxAttempts === undefined || Number.isSafeInteger(reel.maxAttempts) && reel.maxAttempts > 0)) preprocessing += reel.length * (reel.maxAttempts ?? 200) * Math.max(1, (reel.constraints?.length ?? 0) + 1);
            const geometryCells = authored.reels * Math.max(authored.rows, authored.screenGeometry?.generated?.rows ?? 0, authored.screenGeometry?.evaluated?.rows ?? 0);
            if (!Number.isFinite(preprocessing) || preprocessing > 100000 || geometryCells > 100000) {
                snapshot.support = "unsupported";
                snapshot.effective = snapshot.authored;
                snapshot.limits.push("Definition preprocessing exceeds its bounded normalization work limit.");
                snapshot.diagnostics.push(diagnostic("definition-acquisition-budget-exhausted", snapshot.limits[0], "warning"));
                return snapshot;
            }
            snapshot.diagnostics = new GameBlueprintValidator().validate(authored).map((issue) => ({
                code: issue.code,
                severity: issue.severity,
                message: issue.message,
                path: issue.path ?? "",
            }));
            snapshot.diagnostics = definitionDiagnostics(snapshot.diagnostics);
            if (authored.reels > 1000 || authored.rows > 10000 || authored.reels * authored.rows > 1000000) throw new Error("Definition geometry exceeds comparison limits");
            if (snapshot.diagnostics.some((issue) => issue.severity === "error")) {
                snapshot.support = "invalid";
                snapshot.effective = snapshot.authored;
                return snapshot;
            }
            const resolution = resolveReelStripGeneration(authored);
            if (!resolution.success) throw new Error(
                "Deterministic reel generation failed: " + JSON.stringify(resolution.reels).slice(0, 1500),
            );
            const model = {...materializeReelStrips(authored, resolution.reelStripGeneration)};
            Reflect.deleteProperty(model, "symbolWeights");
            Reflect.deleteProperty(model, "reelStripGeneration");
            const extraction = await this.extraction.extract(
                {
                    getManifest: () => model.manifest,
                    getModelDescriptor: () => ({
                        descriptorVersion: 1,
                        blueprintSchemaVersion: 1,
                        sourceKind: "generated",
                        model,
                    }),
                    createSession: () => {
                        throw new Error("Comparison never constructs a session");
                    },
                },
                options,
            );
            const result = this.fromExtraction(extraction, snapshot.identity, input.maxWinPolicy);
            result.identity.revision = snapshot.identity.revision;
            result.authored = input.maxWinPolicy
                ? ({...authored, maxWinPolicy: input.maxWinPolicy} as unknown as DefinitionJson)
                : snapshot.authored;
            for (const field of result.fields) {
                if (field.status === "exact" && !modelFieldPathContains(["maxWinPolicy"], modelFieldPathSegments(field.path) ?? [])) field.authority = "Blueprint source declaration";
                if (modelFieldPathContains(["reelStrips"], modelFieldPathSegments(field.path) ?? [])) {
                    if (!authored.reelStrips) {
                        field.authority = "Deterministic authored reel materialization";
                        field.status = "inferred";
                    }
                }
            }
            result.diagnostics = definitionDiagnostics([...result.diagnostics, ...snapshot.diagnostics]);
            // Generation instructions are authoring data; the effective comparison uses only strips.
            if (result.effective && typeof result.effective === "object") {
                Reflect.deleteProperty(result.effective, "symbolWeights");
                Reflect.deleteProperty(result.effective, "reelStripGeneration");
            }
            return result;
        } catch (error) {
            snapshot.support = options?.signal?.aborted ? "cancelled" : "invalid";
            snapshot.diagnostics.push(
                diagnostic("definition-normalization-failed", error instanceof Error ? error.message : String(error)),
            );
            return snapshot;
        }
    }

    private fromExtraction(
        extraction: PackageBlueprintExtractionResult,
        identity: MathDefinitionSnapshot["identity"],
        declared?: MathDefinitionMaxWinPolicy,
    ): MathDefinitionSnapshot {
        const snapshot: MathDefinitionSnapshot = {
            identity: {...extraction.source, ...identity, descriptorKind: extraction.source.kind},
            support: extraction.status === "malformed" ? "invalid" : extraction.status,
            fields: extraction.fields,
            diagnostics: definitionDiagnostics(extraction.diagnostics.map((issue) => ({...issue, severity: issue.severity ?? "warning"}))),
            limits: extraction.comparisonLimits,
        };
        if (
            extraction.diagnostics.some(
                (issue) => issue.code === "snapshot-release-failed" || issue.code === "package-model-read-failed",
            )
        ) snapshot.support = "failed";
        const model = extraction.model;
        if (!model) return snapshot;
        snapshot.authored = model as unknown as DefinitionJson;
        snapshot.identity.revision = computeGameBlueprintHash(model as GameBlueprint);
        const policy = validateMathDefinitionMaxWinPolicy(
            declared ??
                extraction.maxWinPolicy ??
                (identity.kind === "blueprint"
                    ? {type: "none", scope: "logical-round", authority: "POKIE generated runtime: no payout cap"}
                    : {type: "unknown", authority: "Custom executable cap policy is undeclared"}),
        );
        for (const key of ["", ...Object.keys(policy).map((key) => "." + key)]) snapshot.fields.push({
            path: "maxWinPolicy" + key,
            status: declared || extraction.maxWinPolicy ? "exact" : "defaulted",
            authority: policy.authority,
        });
        if (declared || extraction.maxWinPolicy) snapshot.authored = {...model, maxWinPolicy: policy} as unknown as DefinitionJson;
        if (policy.type === "unknown" && snapshot.support === "complete") snapshot.support = "partial";
        if (policy.type === "unknown") snapshot.diagnostics.push(
            diagnostic("max-win-policy-unknown", policy.authority, "warning", "/maxWinPolicy"),
        );
        snapshot.effective = filterDefaults(snapshot.authored, {
            ...(extraction.source.descriptorVersion === 1 ? effectiveDefaults(model, extraction.fields) : model),
            maxWinPolicy: policy,
        }, [], extraction.fields) as DefinitionJson;
        snapshot.diagnostics = definitionDiagnostics(snapshot.diagnostics);
        return snapshot;
    }
}

/** Both reads are owned and drained, including peer failure and cancellation. Caller games stay owned by callers. */
export async function compareMathDefinitions(
    left: MathDefinitionInput,
    right: MathDefinitionInput,
    options?: {signal?: AbortSignal; reader?: MathDefinitionSourceReading},
) {
    const reader = options?.reader ?? new MathDefinitionSourceReader();
    const reads = await Promise.allSettled([
        Promise.resolve().then(() => reader.read(left, options)),
        Promise.resolve().then(() => reader.read(right, options)),
    ]);
    const snapshots = reads.map((result) =>
        result.status === "fulfilled"
            ? result.value
            : {
                identity: {kind: "unknown"},
                support: "failed" as const,
                fields: [],
                limits: [],
                diagnostics: [
                    diagnostic(
                        "definition-read-failed",
                        result.reason instanceof Error ? result.reason.message : String(result.reason),
                    ),
                ],
            },
    );
    if (options?.signal?.aborted) for (const snapshot of snapshots) if (snapshot.support !== "failed") snapshot.support = "cancelled";
    await Promise.all(snapshots.map(async snapshot => {
        (snapshot as MathDefinitionSnapshot).advanced ??= await validateMathDefinitionSnapshot(snapshot, options);
    }));
    return new MathDefinitionDiffer().diff(snapshots[0], snapshots[1]);
}

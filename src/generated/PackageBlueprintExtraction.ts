import type {PokieGame} from "../gamepackage/PokieGame.js";
import {loadPokieGameRuntime} from "../gamepackage/loadPokieGame.js";
import {computeGameBlueprintHash} from "./computeGameBlueprintHash.js";
import {GAME_BLUEPRINT_SCHEMA_VERSION, type GameBlueprint} from "./GameBlueprint.js";
import {GameBlueprintValidator} from "./GameBlueprintValidator.js";
import {PACKAGE_MODEL_DESCRIPTOR_VERSION} from "./PackageModelDescriptor.js";

export type PackageExtractionDiagnostic = {path: string; code: string; message: string; severity?: "warning" | "error"};
export type PackageExtractionField = {
    path: string;
    status: "exact" | "inferred" | "defaulted" | "unsupported";
    authority: string;
};
export interface PackageBlueprintExtractionResult {
    schemaVersion: 1;
    status: "complete" | "partial" | "unsupported" | "malformed" | "cancelled";
    source: {
        kind: "generated" | "custom" | "legacy";
        location?: string;
        descriptorVersion?: number;
        blueprintSchemaVersion?: number;
        gameId?: string;
        gameVersion?: string;
    };
    /** Partial known data is inspectable, never eligible for automatic generation. */
    model?: Partial<GameBlueprint>;
    blueprint?: GameBlueprint;
    blueprintHash?: string;
    fields: PackageExtractionField[];
    diagnostics: PackageExtractionDiagnostic[];
    comparisonLimits: string[];
}
export interface PackageBlueprintExtracting {
    extract(source: string | PokieGame, options?: {signal?: AbortSignal}): Promise<PackageBlueprintExtractionResult>;
}

const LIMITS = [
    "Descriptor fidelity preserves declared representable data; it does not prove that custom executable code obeys that declaration.",
    "Effective reel distributions are preserved; discarded authoring-time generation instructions are not recovered.",
    "Finite seeded comparisons cover only the exercised traces and cannot prove arbitrary TypeScript losslessness.",
];
const OPTIONAL_DEFAULTS: Record<string, string> = {
    wilds: "generated runtime: no wild symbols",
    scatters: "generated runtime: no scatter symbols",
    paylines: "generated runtime: horizontal evaluated rows",
    availableBets: "VideoSlotConfig default stakes",
    winModel: "generated runtime: lines",
    mechanics: "generated runtime: no features",
    betModes: "generated runtime: no modes",
    screenGeometry: "VideoSlotConfig: visible/evaluated grid equals reels x rows",
};

/** Strict detached JSON copying. Never invokes accessors or toJSON; bounds depth and size. */
export function detachPackageModelData(value: unknown): unknown {
    const ancestors = new Set<object>();
    let nodes = 0;
    const copy = (input: unknown, field: string, depth: number): unknown => {
        if (++nodes > 1000000 || depth > 100) throw new Error(`${field}: metadata exceeds extraction limits`);
        if (input === null || typeof input === "string" || typeof input === "boolean") return input;
        if (typeof input === "number" && Number.isFinite(input)) return input;
        if (typeof input !== "object" || input === null) throw new Error(`${field}: unsupported JSON value`);
        if (ancestors.has(input)) throw new Error(`${field}: cyclic metadata`);
        const array = Array.isArray(input);
        const prototype = Reflect.getPrototypeOf(input);
        if (prototype !== (array ? Array.prototype : Object.prototype) && !(prototype === null && !array)) throw new Error(`${field}: unsupported object prototype`);
        ancestors.add(input);
        const result: Record<string, unknown> | unknown[] = array ? [] : {};
        const descriptors = Object.getOwnPropertyDescriptors(input);
        if (Reflect.ownKeys(input).some((key) => typeof key !== "string")) throw new Error(`${field}: symbol property`);
        if (array) {
            for (let i = 0; i < (input as unknown[]).length; i++) if (!descriptors[String(i)]) throw new Error(`${field}: sparse collection`);
        }
        for (const [key, descriptor] of Object.entries(descriptors)) {
            if (array && key === "length") continue;
            if (["__proto__", "constructor", "prototype", "toJSON"].includes(key)) throw new Error(`${field}.${key}: unsafe property`);
            if (!descriptor.enumerable || !hasOwn(descriptor, "value")) throw new Error(`${field}.${key}: accessor or hidden metadata`);
            if (array && (!(/^(0|[1-9]\d*)$/).test(key) || Number(key) >= (input as unknown[]).length)) throw new Error(`${field}.${key}: malformed collection`);
            Reflect.set(result, key, copy(descriptor.value, `${field}.${key}`, depth + 1));
        }
        ancestors.delete(input);
        return result;
    };
    return copy(value, "$", 0);
}

/** One executable read boundary. Path inputs own a loader snapshot; supplied games remain caller-owned.
 * No session is created or advanced, so opaque legacy mechanics remain explicitly unavailable.
 */
export class PackageBlueprintExtraction implements PackageBlueprintExtracting {
    public async extract(
        input: string | PokieGame,
        options?: {signal?: AbortSignal},
    ): Promise<PackageBlueprintExtractionResult> {
        const result: PackageBlueprintExtractionResult = {
            schemaVersion: 1,
            status: "unsupported",
            source: {kind: "legacy", ...(typeof input === "string" ? {location: input} : {})},
            fields: [],
            diagnostics: [],
            comparisonLimits: [...LIMITS],
        };
        let release: (() => Promise<void>) | undefined;
        const cancelled = (): boolean => {
            if (!options?.signal?.aborted) return false;
            result.status = "cancelled";
            result.diagnostics.push({
                path: "$",
                code: "extraction-cancelled",
                message: "Package extraction was cancelled.",
            });
            return true;
        };
        try {
            if (cancelled()) return result;
            const loaded = typeof input === "string" ? await loadPokieGameRuntime(input) : undefined;
            release = loaded?.release;
            if (cancelled()) return result;
            const game = loaded?.game ?? (input as PokieGame);
            const manifest = detachPackageModelData(game.getManifest()) as GameBlueprint["manifest"];
            if (
                new GameBlueprintValidator()
                    .validate({manifest})
                    .some((issue) => issue.severity === "error" && issue.code.startsWith("blueprint-manifest"))
            ) throw new Error("Malformed game manifest");
            if (cancelled()) return result;
            if (
                [manifest.description, manifest.author].some(
                    (value) => value !== undefined && typeof value !== "string",
                )
            ) throw new Error("Manifest optional metadata must be strings");
            result.source.gameId = manifest.id;
            result.source.gameVersion = manifest.version;
            if (!game.getModelDescriptor) {
                result.model = {manifest};
                this.recordFields(manifest, "manifest", "getManifest", result.fields);
                if (game.getSessionCommandCapabilities) {
                    const capabilities = detachPackageModelData(game.getSessionCommandCapabilities()) as {
                        bets: number[];
                    };
                    if (
                        Array.isArray(capabilities.bets) &&
                        capabilities.bets.every((bet) => typeof bet === "number" && Number.isFinite(bet) && bet > 0)
                    ) {
                        result.model.availableBets = capabilities.bets;
                        this.recordFields(
                            capabilities.bets,
                            "availableBets",
                            "getSessionCommandCapabilities",
                            result.fields,
                        );
                    }
                }
                if (game.getBetModes) {
                    result.model.betModes = detachPackageModelData(game.getBetModes()) as GameBlueprint["betModes"];
                    this.recordFields(
                        result.model.betModes,
                        "betModes",
                        "getBetModes: declarations only, executable semantics unknown",
                        result.fields,
                    );
                }
                for (const field of [
                    "reels",
                    "rows",
                    "symbols",
                    "paytable",
                    "reelSequences",
                    "mechanics",
                    "winModel",
                    "paylines",
                ]) {
                    result.fields.push({
                        path: field,
                        status: "unsupported",
                        authority: "No public effective-model descriptor",
                    });
                }
                if (cancelled()) return result;
                result.status = "partial";
                result.diagnostics.push({
                    path: "$",
                    code: "legacy-model-unavailable",
                    message:
                        "Manifest and declared command data are available. Runtime getters cannot establish authored missing/zero payouts, custom calculators, wild restrictions or feature equivalence. Supply a versioned public effective-model descriptor.",
                });
                return result;
            }
            const descriptor = detachPackageModelData(await game.getModelDescriptor()) as Record<string, unknown>;
            if (cancelled()) return result;
            for (const key of Object.keys(descriptor)) if (
                !["descriptorVersion", "blueprintSchemaVersion", "sourceKind", "model", "unsupported"].includes(key)
            ) throw new Error(`Descriptor field ${key} is outside version 1`);
            result.source = {
                ...result.source,
                ...(descriptor.sourceKind === "generated" || descriptor.sourceKind === "custom"
                    ? {kind: descriptor.sourceKind}
                    : {}),
                ...(typeof descriptor.descriptorVersion === "number"
                    ? {descriptorVersion: descriptor.descriptorVersion}
                    : {}),
                ...(typeof descriptor.blueprintSchemaVersion === "number"
                    ? {blueprintSchemaVersion: descriptor.blueprintSchemaVersion}
                    : {}),
            };
            if (
                descriptor.descriptorVersion !== PACKAGE_MODEL_DESCRIPTOR_VERSION ||
                descriptor.blueprintSchemaVersion !== GAME_BLUEPRINT_SCHEMA_VERSION
            ) {
                Reflect.set(result, "status", "malformed");
                result.diagnostics.push({
                    path: "descriptorVersion",
                    code: "incompatible-model-version",
                    message:
                        "Supported descriptorVersion and blueprintSchemaVersion are both 1; game manifest version is independent.",
                });
                return result;
            }
            if (descriptor.sourceKind !== "generated" && descriptor.sourceKind !== "custom") throw new Error("sourceKind: expected generated or custom");
            if (typeof descriptor.model !== "object" || descriptor.model === null || Array.isArray(descriptor.model)) throw new Error("model: expected an object");
            result.source = {
                ...result.source,
                kind: descriptor.sourceKind,
                descriptorVersion: 1,
                blueprintSchemaVersion: 1,
            };
            const model = descriptor.model as Partial<GameBlueprint>;
            if (
                (model.reels ?? 0) > 1000 ||
                (model.rows ?? 0) > 10000 ||
                (model.reels ?? 0) * (model.rows ?? 0) > 1000000
            ) throw new Error("Model geometry exceeds extraction limits");
            if (
                model.manifest &&
                computeGameBlueprintHash({manifest: model.manifest} as GameBlueprint) !==
                    computeGameBlueprintHash({manifest} as GameBlueprint)
            ) throw new Error("manifest: descriptor differs from getManifest identity/data");
            model.manifest = manifest;
            result.model = model;
            this.recordFields(model, "", "public model descriptor", result.fields);
            for (const field of result.fields) if (field.path === "manifest" || field.path.startsWith("manifest.")) field.authority = "getManifest";
            const known = new Set([
                "manifest",
                "reels",
                "rows",
                "screenGeometry",
                "symbols",
                "wilds",
                "scatters",
                "paylines",
                "paytable",
                "reelStrips",
                "reelSequences",
                "availableBets",
                "winModel",
                "mechanics",
                "betModes",
            ]);
            for (const key of Object.keys(model)) if (!known.has(key)) result.diagnostics.push({
                path: key,
                code: "unsupported-model-field",
                message: "This field is outside the effective Blueprint model contract.",
            });
            const checkKeys = (value: unknown, field: string, allowed: string[]): void => {
                if (value && typeof value === "object" && !Array.isArray(value)) for (const key of Object.keys(value)) {
                    if (!allowed.includes(key)) result.diagnostics.push({
                        path: `${field}.${key}`,
                        code: "unsupported-model-field",
                        message: "Custom model behavior is outside the Blueprint representation.",
                    });
                }
            };
            checkKeys(model.manifest, "manifest", ["id", "name", "version", "description", "author"]);
            checkKeys(model.winModel, "winModel", ["type", "minimumClusterSize"]);
            checkKeys(model.mechanics, "mechanics", ["freeGames"]);
            checkKeys(model.screenGeometry, "screenGeometry", ["generated", "visible", "evaluated", "paylineSpace"]);
            checkKeys(model.screenGeometry?.generated, "screenGeometry.generated", ["reels", "rows"]);
            checkKeys(model.screenGeometry?.visible, "screenGeometry.visible", ["rowOffset", "rows"]);
            checkKeys(model.screenGeometry?.evaluated, "screenGeometry.evaluated", ["rowOffset", "rows"]);
            if (Array.isArray(model.betModes)) model.betModes.forEach((mode, index) =>
                checkKeys(mode, `betModes.${index}`, [
                    "id",
                    "label",
                    "costMultiplier",
                    "runtimeType",
                    "isDefault",
                    "forcedFreeGames",
                    "targetRtp",
                ]),
            );
            checkKeys(model.mechanics?.freeGames, "mechanics.freeGames", ["scatterSymbol", "awardsByCount"]);
            if (descriptor.unsupported !== undefined) {
                if (!Array.isArray(descriptor.unsupported)) throw new Error("unsupported: expected diagnostic array");
                for (const boundary of descriptor.unsupported as PackageExtractionDiagnostic[]) {
                    if (
                        !boundary ||
                        typeof boundary.path !== "string" ||
                        typeof boundary.code !== "string" ||
                        typeof boundary.message !== "string"
                    ) throw new Error("unsupported: malformed diagnostic");
                    if (Object.keys(boundary).some((key) => !["path", "code", "message"].includes(key))) throw new Error("unsupported: unexpected diagnostic metadata");
                    result.diagnostics.push({
                        path: boundary.path,
                        code: boundary.code,
                        message: boundary.message,
                        severity: "error",
                    });
                }
            }
            // Absence is recorded separately, never padded into authored tables/grants.
            for (const [field, authority] of Object.entries(OPTIONAL_DEFAULTS)) if (!hasOwn(model, field)) result.fields.push({path: field, status: "defaulted", authority});
            const omitted = (field: string, authority: string): void => {
                result.fields.push({path: field, status: "defaulted", authority});
            };
            for (const field of ["description", "author"]) if (!hasOwn(manifest, field)) omitted(`manifest.${field}`, "manifest: optional metadata absent");
            if (!model.winModel) omitted("winModel.type", "generated runtime: lines");
            if (!model.mechanics?.freeGames) omitted("mechanics.freeGames", "generated runtime: no free-game feature");
            if (!model.screenGeometry) for (const field of [
                "generated.reels",
                "generated.rows",
                "visible.rowOffset",
                "visible.rows",
                "evaluated.rowOffset",
                "evaluated.rows",
                "paylineSpace",
            ]) omitted(`screenGeometry.${field}`, "VideoSlotConfig default geometry");
            model.betModes?.forEach((mode, index) => {
                if (mode.label === undefined) omitted(`betModes.${index}.label`, "BetModeDefinition: mode ID");
                if (mode.costMultiplier === undefined) omitted(`betModes.${index}.costMultiplier`, "base/metadata mode: 1");
                if (mode.runtimeType === undefined) omitted(`betModes.${index}.runtimeType`, "declarative metadata only; no executable mode wiring");
            });
            if (model.winModel?.type === "clusters" && model.winModel.minimumClusterSize === undefined) result.fields.push({
                path: "winModel.minimumClusterSize",
                status: "defaulted",
                authority: "ClusterWinCalculator: 5",
            });
            if (!model.reelStrips && !model.reelSequences) result.diagnostics.push({
                path: "reelSequences",
                code: "effective-reels-unavailable",
                message:
                        "Extraction requires the effective complete reel distribution; generation instructions or selected variants cannot replace it.",
            });
            if (model.symbols && model.paytable && Number.isInteger(model.reels) && Number.isInteger(model.rows)) {
                const maximum = Math.min(
                    10000,
                    model.winModel?.type === "clusters" || model.scatters?.length
                        ? model.reels! * model.rows!
                        : model.reels!,
                );
                if (maximum * model.symbols.length > 1000000) throw new Error("Field evidence exceeds extraction limits");
                for (const symbol of model.symbols) {
                    if (!hasOwn(model.paytable, symbol)) result.fields.push({
                        path: `paytable.${symbol}`,
                        status: "exact",
                        authority: "descriptor: authored symbol table absent; no payouts",
                    });
                    else for (let count = 1; count <= maximum; count++) if (!hasOwn(model.paytable[symbol], String(count))) result.fields.push({
                        path: `paytable.${symbol}.${count}`,
                        status: "exact",
                        authority: "descriptor: authored payout absent; effective zero",
                    });
                }
                const free = model.mechanics?.freeGames;
                if (free && free.awardsByCount) for (let count = 0; count <= maximum; count++) if (!hasOwn(free.awardsByCount, String(count))) result.fields.push({
                    path: `mechanics.freeGames.awardsByCount.${count}`,
                    status: "exact",
                    authority: "descriptor: authored grant absent; effective zero",
                });
            }
            if (result.fields.length > 1000000) throw new Error("Field evidence exceeds extraction limits");
            const validation = new GameBlueprintValidator().validate(model);
            if (
                model.winModel?.type === "clusters" &&
                (model.winModel.minimumClusterSize ?? 5) >
                    model.reels! * (model.screenGeometry?.evaluated.rows ?? model.rows!)
            ) validation.push({
                code: "blueprint-cluster-grid-incompatible",
                severity: "error",
                path: "winModel.minimumClusterSize",
                message: "The cluster minimum exceeds the effective evaluation grid.",
            });
            const missing = validation.filter((issue) => issue.severity === "error");
            for (const issue of validation) result.diagnostics.push({
                path: issue.path ?? requiredFieldPath(issue.code),
                code: issue.code,
                message: issue.message,
                severity: issue.severity,
            });
            for (const diagnostic of result.diagnostics.filter((issue) => issue.severity !== "warning" && issue.severity !== "info")) result.fields.push({path: diagnostic.path, status: "unsupported", authority: diagnostic.code});
            const required = ["reels", "rows", "symbols", "paytable"];
            if (missing.length > 0) result.status = required.some((field) => !hasOwn(model, field)) ? "partial" : "malformed";
            else if (result.diagnostics.some((issue) => issue.severity !== "warning" && issue.severity !== "info")) result.status = "unsupported";
            else {
                result.status = "complete";
                result.blueprint = model as GameBlueprint;
                result.blueprintHash = computeGameBlueprintHash(result.blueprint);
            }
            if (cancelled()) {
                Reflect.deleteProperty(result, "blueprint");
                Reflect.deleteProperty(result, "blueprintHash");
            }
            return result;
        } catch (error) {
            result.status = options?.signal?.aborted ? "cancelled" : "malformed";
            Reflect.deleteProperty(result, "blueprint");
            Reflect.deleteProperty(result, "blueprintHash");
            result.diagnostics.push({
                path: "$",
                code: "package-model-read-failed",
                message: (error instanceof Error ? error.message : "Package/model read failed").slice(0, 2000),
            });
            return result;
        } finally {
            try {
                await release?.();
            } catch {
                Reflect.set(result, "status", "malformed");
                Reflect.deleteProperty(result, "blueprint");
                Reflect.deleteProperty(result, "blueprintHash");
                result.diagnostics.push({
                    path: "$",
                    code: "snapshot-release-failed",
                    message: "Could not release the extraction-owned runtime snapshot.",
                });
            }
        }
    }

    private recordFields(value: unknown, field: string, authority: string, fields: PackageExtractionField[]): void {
        if (field) fields.push({path: field, status: "exact", authority});
        if (typeof value === "object" && value !== null) for (const [key, child] of Object.entries(value)) this.recordFields(child, field ? `${field}.${key}` : key, authority, fields);
    }
}

function requiredFieldPath(code: string): string {
    for (const field of [
        "paytable",
        "reelstrips",
        "manifest",
        "symbols",
        "wilds",
        "scatters",
        "reels",
        "rows",
        "paylines",
        "mechanics",
        "winmodel",
        "betmodes",
    ]) {
        if (code.startsWith(`blueprint-${field}`)) return (
            ({winmodel: "winModel", betmodes: "betModes", reelstrips: "reelStrips"} as Record<string, string>)[
                field
            ] ?? field
        );
    }
    return "$";
}

function hasOwn(value: object, key: PropertyKey): boolean {
    return Reflect.apply(Object.prototype.hasOwnProperty, value, [key]) as boolean;
}

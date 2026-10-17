import {resolveSharedSlotMathModel} from "../../generated/resolveSharedSlotMathModel.js";
import {integerRelativeWeights} from "../../session/videoslot/combinations/WeightedSymbolsSequence.js";
import {ParallelSimulationRunner} from "../../simulation/parallel/ParallelSimulationRunner.js";
import type {SimulationStatistics} from "../../simulation/SimulationStatistics.js";
import type {OptimizationSimulationRecipe} from "./createOptimizationSimulationGame.js";
import {refreshPackageTuning, verifyPackageSourceHashes} from "./DeclaredTuningAuthority.js";
import {compareIds} from "../../weightedoutcome/internal/compareIds.js";
import {writeNativeStakeTuningManifest} from "./NativeStakeTuningManifest.js";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import type {GameBlueprint} from "../../generated/GameBlueprint.js";
import {GameBlueprintValidator} from "../../generated/GameBlueprintValidator.js";
import {computeGameBlueprintHash} from "../../generated/computeGameBlueprintHash.js";
import {createPokieGameDependencyOverlay} from "../../gamepackage/resolvePokieGameEntryModule.js";
import {OptimizationInputError} from "../validateOptimizationRequest.js";
import {loadPokieGame, loadPokieGameRuntime} from "../../gamepackage/loadPokieGame.js";
import {releaseSimulationGame} from "../../simulation/parallel/internal/releaseSimulationGame.js";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {PokieProject} from "../../project/PokieProject.js";
import {readWasmComponentManifest} from "../../project/readWasmComponentManifest.js";
import type {PokieWasmComponentManifest} from "../../project/wasm/PokieWasmComponentManifest.js";
import {resolveCanonicalWasmGameModel} from "../../project/WasmArtifactBuilder.js";
import {computeBlueprintHash} from "../../parsheet/computeBlueprintHash.js";
import {ParSheetImporter} from "../../parsheet/ParSheetImporter.js";
import {OutcomeLibraryBundleReader} from "../../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import {OutcomeLibraryBundleWriter} from "../../weightedoutcome/bundle/OutcomeLibraryBundleWriter.js";
import {OutcomeLibraryBundleValidator} from "../../weightedoutcome/bundle/OutcomeLibraryBundleValidator.js";
import {WeightedOutcomeLibraryAnalyzer} from "../../weightedoutcome/WeightedOutcomeLibraryAnalyzer.js";
import {
    buildWeightedOutcomeLibrary,
    type WeightedOutcomeInput,
} from "../../weightedoutcome/buildWeightedOutcomeLibrary.js";

import {computeWeightedOutcomeLibraryFeatureBreakdown} from "../../weightedoutcome/computeWeightedOutcomeLibraryFeatureBreakdown.js";
import {generateExactWeightedOutcomeLibrary} from "../../weightedoutcome/generate/generateExactWeightedOutcomeLibrary.js";
import {StakeEngineOutcomeSourceReader} from "../../stakeengine/standalone/StakeEngineOutcomeSourceReader.js";
import {StakeEngineStandaloneAnalyzer} from "../../stakeengine/standalone/StakeEngineStandaloneAnalyzer.js";
import type {StakeEngineOutcomeRecord} from "../../stakeengine/standalone/StakeEngineOutcomeRecord.js";
import {loadPokieWasmFileRuntime} from "../../wasm/node/PokieWasmFileRuntimeAdapter.js";
import {stableSlotMathJson} from "../../wasm/math/SharedSlotMath.js";
import {createTunableBlueprintGame} from "../createTunableBlueprintGame.js";
import {
    compileBoundTuningWasm,
    type CanonicalWasmTuningContract,
    type DeclaredPackageTuningContract,
} from "../DeclaredTuningContract.js";
import type {MathTarget, OptimizationPolicy, OptimizationScalar} from "../OptimizationPolicy.js";
import {copyPackage, digest, inventory, jsonHash, paytablePaths, readJson, writeJson} from "./optimizationData.js";

type NativeOutcome = {
    weight: OptimizationScalar;
    artifact?: WeightedOutcomeInput["artifact"];
    stake?: Omit<StakeEngineOutcomeRecord, "weight">;
};
type NativeModel = {
    modes: Record<string, {libraryId?: string; cost?: number; outcomes: Record<string, NativeOutcome>}>;
};
export class OptimizationUnsupportedError extends Error {}
export class OptimizationCancelledError extends Error {}
export class OptimizationCleanupError extends Error {}
export class OptimizationExhaustedError extends Error {}
type OptimizationSamplingOptions = {signal?: AbortSignal; workerEntryUrl?: URL; onProgress(completed: number): void; onValidationWork(completed: number): void};
export interface ProjectOptimizationAdapting {
    model: unknown;
    writable: string[];
    sample(file: string, model: unknown, targets: MathTarget[], policy: OptimizationPolicy, seed: string, samples: number, options: OptimizationSamplingOptions): Promise<{statistics: SimulationStatistics; returnBound: number; validationWork: number; stopReason: string}>;
    materialize(model: unknown, directory: string, signal?: AbortSignal): Promise<string>;
    read(file: string): Promise<unknown>;
    measure(
        file: string,
        model: unknown,
        targets: MathTarget[],
        policy: OptimizationPolicy,
        signal?: AbortSignal,
    ): Promise<number[]>;
}
function errors(issues: readonly {severity: string; message: string}[]): void {
    const failed = issues.filter((issue) => issue.severity === "error");
    if (failed.length) throw new Error(failed.map((issue) => issue.message).join("; "));
}
function cancelled(signal?: AbortSignal): void {
    if (signal?.aborted) throw new OptimizationCancelledError("Optimization cancelled.");
}
function encode(value: string): string {
    return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
function assertBlueprint(model: unknown): asserts model is GameBlueprint {
    errors(new GameBlueprintValidator().validate(model));
}
function assertFiniteBlueprint(blueprint: GameBlueprint, policy: OptimizationPolicy): void {
    assertBlueprint(blueprint);
    if (!blueprint.reelStrips && !blueprint.reelSequences) throw new OptimizationUnsupportedError(
        "This workflow requires authored literal reels or whole-sequence variants.",
    );
    const mechanics = Object.entries(blueprint.mechanics ?? {}).filter(([, value]) => value !== undefined);
    if (mechanics.some(([key]) => key !== "freeGames") || (mechanics.length && policy.scope !== "paid-entry")) throw new OptimizationUnsupportedError(
        "Exact tuning supports simple finite spins, or free-game entry spins with paid-entry scope only. Full feature-round optimization is unavailable.",
    );
    if (policy.mode !== "base" || blueprint.betModes?.length) throw new OptimizationUnsupportedError("This finite authored workflow supports the base mode only.");
    if (policy.scope === "native-outcomes") throw new OptimizationUnsupportedError("Authored models require paid-entry or logical-round scope.");
    if (!(blueprint.availableBets ?? [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100]).includes(policy.stake)) throw new OptimizationUnsupportedError("Requested stake is not an authored available bet.");
}
async function readNative(project: PokieProject): Promise<NativeModel> {
    const model: NativeModel = {modes: {}};
    if (project.type === "outcomeLibrary") {
        errors(await new OutcomeLibraryBundleValidator().validate(project.rootPath, {deep: true}));
        const reader = new OutcomeLibraryBundleReader();
        const manifest = await reader.readManifest(project.rootPath);
        for (const mode of manifest.modes) {
            const library = await reader.readLibrary(project.rootPath, mode.modeName);
            model.modes[mode.modeName] = {
                libraryId: library.libraryId,
                outcomes: Object.fromEntries(
                    library.outcomes.map((outcome) => [
                        outcome.id,
                        {weight: outcome.weight, artifact: outcome.artifact},
                    ]),
                ),
            };
        }
    } else {
        const source = await new StakeEngineOutcomeSourceReader().readFromDirectory(project.rootPath);
        errors(source.issues);
        for (const mode of source.modes) model.modes[mode.modeName] = {
            cost: mode.cost,
            outcomes: Object.fromEntries(
                mode.outcomes.map(({weight, ...outcome}) => [
                    String(outcome.id),
                    {weight: weight.toString(), stake: outcome},
                ]),
            ),
        };
    }
    return model;
}
function selectLibraryMetrics(
    outcomes: WeightedOutcomeInput[],
    id: string,
    targets: MathTarget[],
    _policy: OptimizationPolicy,
): number[] {
    const library = buildWeightedOutcomeLibrary({libraryId: id, outcomes});
    const analysis = new WeightedOutcomeLibraryAnalyzer().analyze(library);
    const events = computeWeightedOutcomeLibraryFeatureBreakdown(library);
    return targets.map((target) => {
        switch (target.metric) {
            case "rtp":
                return analysis.rtp;
            case "volatility":
                return target.unit === "variance" ? analysis.variance : analysis.standardDeviation;
            case "hitFrequency":
                return analysis.hitFrequency;
            case "featureFrequency":
                return events.featureEvents.find((event) => event.key === target.event)?.weightedFrequency ?? 0;
            case "distribution":
                return analysis.payoutDistribution
                    .filter(
                        (bucket) =>
                            bucket.payoutMultiplier >= target.bucket!.min &&
                            (target.bucket!.max === null || bucket.payoutMultiplier < target.bucket!.max),
                    )
                    .reduce((sum, bucket) => sum + bucket.probability, 0);
            case "maxWin":
                return target.unit === "currency"
                    ? analysis.maxWin
                    : outcomes.reduce((maximum, outcome) => Math.max(maximum, outcome.artifact.payoutMultiplier), 0);
            default:
                throw new OptimizationUnsupportedError("Unknown metric.");
        }
    });
}
async function measureGame(
    game: PokieGame,
    blueprint: GameBlueprint,
    targets: MathTarget[],
    policy: OptimizationPolicy,
    signal?: AbortSignal,
    onValidationWork?: (count: number) => void,
): Promise<number[]> {
    try {
        cancelled(signal);
        if (game.getConfigHash?.() !== computeGameBlueprintHash(blueprint)) throw new OptimizationUnsupportedError("Executable getConfigHash does not bind the declared tuning model.");
        const selectedGame = selectStake(game, policy.stake);
        const result = await generateExactWeightedOutcomeLibrary({
            libraryId: "optimization",
            game: selectedGame,
            pokieVersion: "1.3.0",
            exact: true,
            stake: policy.stake,
            maxOutcomeSpaceSize: BigInt(policy.maxOutcomes),
            signal,
            onProgress: onValidationWork ? count => onValidationWork(Number(count)) : undefined,
            now: () => new Date(0),
        });
        if (result.diagnostics.strategy !== "exact") throw new OptimizationUnsupportedError("Sampled analysis cannot prove an exact target.");
        return selectLibraryMetrics([...result.library.outcomes], "optimization", targets, policy);
    } finally {
        if (game.release) await releaseOwnedRuntime(() => game.release!());
    }
}
function assertContract(contract: DeclaredPackageTuningContract): void {
    if (
        contract?.version !== "pokie.tuning.v1" ||
        contract.runtimeBinding !== "getConfigHash:blueprint-v1" ||
        typeof contract.parameterFile !== "string" ||
        contract.parameterFile.startsWith("/") ||
        contract.parameterFile.includes("\\") ||
        contract.parameterFile.split("/").some((part) => ["..", ".", ""].includes(part)) ||
        !Array.isArray(contract.paths)
    ) throw new OptimizationUnsupportedError("Unsupported declared package tuning contract.");
}
/** Internal: all public operations go through the shared service preflight. */
export async function acquireOptimizationAdapter(
    project: PokieProject,
    policy: OptimizationPolicy,
): Promise<ProjectOptimizationAdapting> {
    if (project.type === "outcomeLibrary" || project.type === "stakeAdapter") {
        if (policy.scope !== "native-outcomes") throw new OptimizationUnsupportedError(
            "Native weights establish only the selected native-outcomes population, not a generating game's logical round.",
        );
        if (project.type === "stakeAdapter" && fs.existsSync(path.join(project.rootPath, "pokie-manifest.json")) && fs.existsSync(path.join(project.rootPath, "optimization-input-pokie-manifest.json"))) throw new OptimizationUnsupportedError("A prior Stake input-provenance archive already occupies the required companion path.");
        const model = await readNative(project);
        if (!model.modes[policy.mode]) throw new OptimizationUnsupportedError(`Unknown native mode ${policy.mode}.`);
        if (project.type === "outcomeLibrary" && Object.values(model.modes[policy.mode].outcomes).some(outcome => outcome.artifact!.stake !== policy.stake)) throw new OptimizationUnsupportedError("Native library stake must match every selected artifact.");
        const escapeMode = encode(policy.mode);
        const writable = Object.keys(model.modes[policy.mode].outcomes).map(
            (id) => `/modes/${escapeMode}/outcomes/${encode(id)}/weight`,
        );
        for (const tunable of policy.tunables) if (
            tunable.values.some((value) =>
                project.type === "stakeAdapter" ? typeof value !== "string" : typeof value !== "number",
            )
        ) throw new OptimizationInputError([{path: tunable.path, message: "Stake weights require uint64 strings; Outcome Library weights require numbers."}]);
        for (const field of policy.tunables) if (field.values.some((value) => typeof value === "string" ? BigInt(value) === BigInt(0) : value <= 0)) throw new OptimizationInputError([{path: field.path, message: "Native weights must be positive; zero-weight domains are unsupported by the native format."}]);
        if (project.type === "outcomeLibrary") {
            const maximumTotal = Object.entries(model.modes[policy.mode].outcomes).reduce((sum, [id, outcome]) => {
                const values = policy.tunables.find((field) => field.path === `/modes/${escapeMode}/outcomes/${encode(id)}/weight`)?.values ?? [outcome.weight];
                return sum + values.reduce<number>((maximum, value) => Math.max(maximum, Number(value)), 0);
            }, 0);
            if (!Number.isFinite(maximumTotal)) throw new OptimizationInputError([{path: "policy/tunables", message: "Native library total weight must remain finite throughout the declared domain."}]);
        }
        return {
            model,
            writable,
            async materialize(value, directory, signal) {
                cancelled(signal);
                const data = value as NativeModel;
                const output = path.join(directory, "candidate");
                if (project.type === "outcomeLibrary") {
                    const written = await new OutcomeLibraryBundleWriter("1.3.0", undefined, () => new Date(0)).writeToDirectory(
                        Object.entries(data.modes).map(([modeName, mode]) => ({
                            modeName,
                            libraryId: mode.libraryId!,
                            outcomes: Object.entries(mode.outcomes)
                                .map(([id, outcome]) => ({
                                    id,
                                    weight: outcome.weight as number,
                                    artifact: outcome.artifact!,
                                }))
                                .sort((a, b) => compareIds(a.id, b.id)),
                        })),
                        output,
                        {signal},
                    );
                    errors(written.issues);
                    const sourceManifest = await new OutcomeLibraryBundleReader().readManifest(project.rootPath);
                    const canonicalFiles = new Set([...sourceManifest.files, "manifest.json"]);
                    for (const file of Object.keys(inventory(project.rootPath))) {
                        if (canonicalFiles.has(file)) continue;
                        const target = path.join(output, file);
                        fs.mkdirSync(path.dirname(target), {recursive: true});
                        fs.copyFileSync(path.join(project.rootPath, file), target, fs.constants.COPYFILE_EXCL);
                    }
                } else {
                    copyPackage(project.rootPath, output);
                    // Export/import metadata describes the old distribution, not these native uint64 weights.
                    const priorManifest = path.join(output, "pokie-manifest.json");
                    if (fs.existsSync(priorManifest)) {
                        fs.renameSync(priorManifest, path.join(output, "optimization-input-pokie-manifest.json"));
                    }
                    const index = readJson(path.join(output, "index.json")) as {
                        modes: {name: string; weights: string}[];
                    };
                    for (const mode of index.modes) {
                        if (mode.name !== policy.mode) continue;
                        const csv = path.join(output, mode.weights);
                        const lines = fs
                            .readFileSync(csv, "utf8")
                            .split("\n")
                            .filter(Boolean)
                            .map((line) => {
                                const fields = line.split(",");
                                fields[1] = String(data.modes[mode.name].outcomes[fields[0]].weight);
                                return fields.join(",");
                            });
                        fs.writeFileSync(csv, `${lines.join("\n")}\n`);
                    }
                    writeNativeStakeTuningManifest(output);
                }
                cancelled(signal);
                return output;
            },
            read: (file) => readNative({...project, rootPath: file}),
            sample(file, value, targets, requested, seed, samples, options) {
                const mode = (value as NativeModel).modes[requested.mode];
                const outcomes = Object.values(mode.outcomes);
                if (outcomes.length > requested.maxOutcomes) throw new OptimizationExhaustedError("Native support population exceeds maxOutcomes.");
                const weights = project.type === "stakeAdapter" ? outcomes.map(outcome => BigInt(outcome.weight)) : integerRelativeWeights(outcomes.map(outcome => outcome.weight as number));
                const recipe: OptimizationSimulationRecipe = {
                    kind: "native", modelId: jsonHash(value), stake: requested.stake, cost: mode.cost ?? 1,
                    outcomes: outcomes.map((outcome, i) => ({weight: weights[i].toString(),
                        payoutPerBet: outcome.artifact?.payoutMultiplier ?? outcome.stake!.payoutMultiplier / 100,
                        events: [...new Set(outcome.artifact?.featureEvents?.map(event => event.type) ?? outcome.stake?.events.map(event => event.type) ?? [])],})),
                };
                const returnBound = nativeReturnBound(recipe.outcomes, recipe.cost);
                return samplePopulation(file, targets, requested, seed, samples, returnBound, options, recipe);
            },
            measure(_file, value, targets, requested) {
                const data = value as NativeModel;
                const mode = data.modes[requested.mode];
                const outcomes = Object.entries(mode.outcomes);
                if (outcomes.length > requested.maxOutcomes) throw new OptimizationExhaustedError("Native outcome population exceeds maxOutcomes; no metric proof was established.");
                if (project.type === "outcomeLibrary") {
                    if (outcomes.some(([, outcome]) => outcome.artifact!.stake !== requested.stake)) throw new OptimizationUnsupportedError(
                        "Native library stake must match every selected artifact.",
                    );
                    return Promise.resolve(
                        selectLibraryMetrics(
                            outcomes.map(([id, outcome]) => ({
                                id,
                                weight: outcome.weight as number,
                                artifact: outcome.artifact!,
                            })),
                            mode.libraryId!,
                            targets,
                            requested,
                        ),
                    );
                }
                const source = {
                    stakeDir: _file,
                    issues: [],
                    modes: [
                        {
                            modeName: requested.mode,
                            cost: mode.cost!,
                            outcomes: outcomes.map(([, outcome]) => ({
                                ...outcome.stake!,
                                weight: BigInt(outcome.weight),
                            })),
                        },
                    ],
                };
                const analysis = new StakeEngineStandaloneAnalyzer({
                    classify: (event) => ({category: event.type}),
                }).analyze(source).modes[0];
                return Promise.resolve(
                    targets.map((target) => {
                        switch (target.metric) {
                            case "rtp":
                                return analysis.rtp;
                            case "volatility":
                                return target.unit === "variance" ? analysis.variance : analysis.standardDeviation;
                            case "hitFrequency":
                                return analysis.hitFrequency;
                            case "maxWin":
                                return analysis.maxRatio * (target.unit === "currency" ? requested.stake : 1);
                            case "featureFrequency":
                                return Number(
                                    analysis.eventClassificationBreakdown.find(
                                        (event) => event.category === target.event,
                                    )?.occurrenceFrequency ?? 0,
                                );
                            case "distribution":
                                return analysis.payoutDistribution
                                    .filter(
                                        (bucket) =>
                                            (bucket.ratio ?? bucket.payoutMultiplier / mode.cost! / 100) >=
                                                target.bucket!.min &&
                                            (target.bucket!.max === null ||
                                                (bucket.ratio ?? bucket.payoutMultiplier / mode.cost! / 100) <
                                                    target.bucket!.max),
                                    )
                                    .reduce((sum, bucket) => sum + Number(bucket.probability), 0);
                            default:
                                throw new OptimizationUnsupportedError("Unknown metric.");
                        }
                    }),
                );
            },
        };
    }
    let blueprint: GameBlueprint;
    let contract: DeclaredPackageTuningContract | undefined;
    let wasmContract: CanonicalWasmTuningContract | undefined;
    let wasmManifest: PokieWasmComponentManifest | undefined;
    if (project.type === "blueprint") blueprint = readJson(project.rootPath) as GameBlueprint;
    else if (project.type === "parWorkbook") {
        const imported = await new ParSheetImporter().importFromFile(project.rootPath);
        errors(imported.issues);
        if (!imported.conversionEvidence?.losslessEligible) throw new OptimizationUnsupportedError(
            "PAR tuning requires a lossless canonical workbook without ignored/defaulted/formula features.",
        );
        blueprint = imported.blueprint;
    } else if (project.type === "tsPackage") {
        if (!fs.existsSync(path.join(project.rootPath, "pokie-tuning.json"))) throw new OptimizationUnsupportedError(
            "Opaque TS package: missing pokie-tuning.json source/tuning authority.",
        );
        contract = readJson(path.join(project.rootPath, "pokie-tuning.json")) as DeclaredPackageTuningContract;
        assertContract(contract);
        try {
            verifyPackageSourceHashes(project.rootPath, contract);
        } catch (error) {
            throw new OptimizationUnsupportedError((error as Error).message);
        }
        blueprint = readJson(path.join(project.rootPath, contract.parameterFile)) as GameBlueprint;
        if (computeGameBlueprintHash(blueprint) !== contract.modelHash) throw new OptimizationUnsupportedError("Stale package tuning model hash.");
    } else {
        if (!fs.existsSync(`${project.rootPath}.tuning.json`)) throw new OptimizationUnsupportedError("Opaque WASM: missing bound source/build tuning provenance.");
        wasmContract = readJson(`${project.rootPath}.tuning.json`) as CanonicalWasmTuningContract;
        if (
            wasmContract?.version !== "pokie.wasm-tuning.v1" ||
            wasmContract.builder !== "canonical-pokie-v1" ||
            !Array.isArray(wasmContract.paths)
        ) throw new OptimizationUnsupportedError("Unsupported WASM tuning contract.");
        const read = await readWasmComponentManifest(project);
        if (!read.supported || !read.canonical) throw new OptimizationUnsupportedError("WASM tuning requires a canonical executable artifact.");
        wasmManifest = read.manifest;
        blueprint = wasmContract.blueprint;
        if (
            wasmContract.modelHash !== computeGameBlueprintHash(blueprint) ||
            wasmContract.moduleHash !== wasmManifest.artifact!.sha256 ||
            digest(compileBoundTuningWasm(blueprint, wasmManifest)) !== digest(fs.readFileSync(project.rootPath))
        ) throw new OptimizationUnsupportedError(
            "WASM source/build provenance is stale, tampered or not reproducible.",
        );
        if (!blueprint.reelStrips || blueprint.reelSequences || Object.keys(blueprint.mechanics ?? {}).length) throw new OptimizationUnsupportedError(
            "WASM tuning currently supports literal-reel finite components without features.",
        );
    }
    assertFiniteBlueprint(blueprint, policy);
    if (policy.strategy === "seeded-search-v1" && blueprint.winModel && blueprint.winModel.type !== "lines") throw new OptimizationUnsupportedError("Sampled authored tuning currently supports line payouts only; exact support is unchanged.");
    if (policy.strategy === "seeded-search-v1" && project.type === "tsPackage" && Object.keys(blueprint.mechanics ?? {}).length) throw new OptimizationUnsupportedError("Sampled declared packages currently require simple complete rounds; authored Blueprint/PAR paid-entry features and native event populations are supported separately.");
    const writable = contract?.paths ?? wasmContract?.paths ?? paytablePaths(blueprint);
    if (writable.some((field) => !paytablePaths(blueprint).includes(field))) throw new OptimizationUnsupportedError("Tuning contract grants an unsupported writable field.");
    if (policy.tunables.some((field) => field.values.some((value) => typeof value !== "number"))) throw new OptimizationUnsupportedError("Paytable values must be numbers.");
    return {
        model: blueprint,
        writable,
        async materialize(value, directory, signal) {
            cancelled(signal);
            assertBlueprint(value);
            const model = value as GameBlueprint;
            if (project.type === "blueprint") {
                const output = path.join(directory, "candidate.blueprint.json");
                writeJson(output, model);
                return output;
            }
            if (project.type === "parWorkbook") {
                // Edit only the declared paytable cells; preserve all other workbook parts/declarations.
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(project.rootPath);
                const sheet = workbook.getWorksheet("Paytable")!;
                const header = sheet.getRow(1);
                const columns = new Map<string, number>();
                header.eachCell((cell, index) => columns.set(String(cell.value), index));
                sheet.eachRow((row, number) => {
                    if (number === 1) return;
                    const symbol = String(row.getCell(columns.get("Symbol")!).value);
                    const count = String(row.getCell(columns.get("Matches")!).value);
                    row.getCell(columns.get("Multiplier")!).value = model.paytable[symbol][count];
                });
                workbook.getWorksheet("Meta")?.eachRow((row) => {
                    if (row.getCell(1).value === "Blueprint Hash") row.getCell(2).value = computeBlueprintHash(model);
                });
                const output = path.join(directory, "candidate.xlsx");
                await workbook.xlsx.writeFile(output);
                return output;
            }
            if (project.type === "tsPackage") {
                const output = path.join(directory, "candidate");
                copyPackage(project.rootPath, output);
                await createPokieGameDependencyOverlay(output, project.rootPath);
                writeJson(path.join(output, contract!.parameterFile), model);
                refreshPackageTuning(output, contract!, model);
                return output;
            }
            const output = path.join(directory, "candidate.wasm");
            let manifest = structuredClone(wasmManifest!);
            manifest = {
                ...manifest,
                artifact: {
                    ...manifest.artifact!,
                    configurationHash: digest(stableSlotMathJson(resolveCanonicalWasmGameModel(model))),
                },
            };
            const bytes = compileBoundTuningWasm(model, manifest);
            manifest = {...manifest, artifact: {...manifest.artifact!, sha256: digest(bytes), bytes: bytes.length}};
            fs.writeFileSync(output, bytes);
            writeJson(`${output}.pokie-wasm.json`, manifest);
            writeJson(`${output}.tuning.json`, {
                ...wasmContract,
                blueprint: model,
                modelHash: computeGameBlueprintHash(model),
                moduleHash: manifest.artifact!.sha256,
            });
            cancelled(signal);
            return output;
        },
        async read(file) {
            if (project.type === "parWorkbook") {
                const result = await new ParSheetImporter().importFromFile(file);
                errors(result.issues);
                return result.blueprint;
            }
            if (project.type === "tsPackage") {
                const savedContract = readJson(path.join(file, "pokie-tuning.json")) as DeclaredPackageTuningContract;
                if (jsonHash({...savedContract, modelHash: contract!.modelHash}) !== jsonHash(contract)) throw new Error("Serialized package tuning authority changed.");
                verifyPackageSourceHashes(file, contract!);
                const model = readJson(path.join(file, contract!.parameterFile)) as GameBlueprint;
                if (savedContract.modelHash !== computeGameBlueprintHash(model)) throw new Error("Serialized package model hash changed.");
                return model;
            }
            if (project.type === "wasm") return (readJson(`${file}.tuning.json`) as CanonicalWasmTuningContract).blueprint;
            return readJson(file);
        },
        async sample(file, value, targets, requested, seed, samples, options) {
            const model = value as GameBlueprint;
            // For this supported line-pay contract, at most one paytable award per line
            // plus one per scatter identity is possible. No sampled maximum grants authority.
            const resolved = resolveSharedSlotMathModel(model);
            const maximum = Object.values(resolved.paytable).reduce((bound, table) => Object.values(table).reduce((largest, payout) => Math.max(largest, payout), bound), 0);
            let returnBound = maximum * (resolved.paylines.length + resolved.scatters.length);
            let validationWork = 0;
            const validationProgress = (completed: number): void => {
                validationWork = completed;
                options.onValidationWork(completed);
            };
            if (project.type === "wasm") {
                await verifyWasmExecutable(file, model, requested, options.signal, validationProgress);
            }
            if (project.type === "tsPackage") {
                const runtime = await loadPokieGameRuntime(file);
                try {
                    [returnBound] = await measureGame(runtime.game, model, [{metric: "maxWin", unit: "betMultiple", value: 0}], requested, options.signal, validationProgress);
                } finally {
                    await releaseOwnedRuntime(() => runtime.release());
                }
            }
            const recipe: OptimizationSimulationRecipe | undefined = project.type === "tsPackage" ? undefined : {
                kind: "authored-entry", blueprint: model, stake: requested.stake, modelId: computeGameBlueprintHash(model),
            };
            const result = await samplePopulation(file, targets, requested, seed, samples, returnBound, options, recipe,
                project.type === "tsPackage" ? async () => {
                    const game = await loadPokieGame(file);
                    if (game.getConfigHash?.() !== computeGameBlueprintHash(model)) {
                        await releaseOwnedRuntime(() => releaseSimulationGame(game));
                        throw new OptimizationUnsupportedError("Executable does not bind declared model.");
                    }
                    return game;
                } : undefined, computeGameBlueprintHash(model));
            return {...result, validationWork};
        },
        async measure(file, value, targets, requested, signal) {
            const model = value as GameBlueprint;
            if (project.type === "tsPackage") {
                const runtime = await loadPokieGameRuntime(file);
                try {
                    return await measureGame(runtime.game, model, targets, requested, signal);
                } finally {
                    await releaseOwnedRuntime(() => runtime.release());
                }
            }
            if (project.type === "wasm") await verifyWasmExecutable(file, model, requested, signal);
            return measureGame(createTunableBlueprintGame(model), model, targets, requested, signal);
        },
    };
}
/** Compare the rebuilt executable over every literal reel-stop tuple, through the real portable runtime. */
async function verifyWasmExecutable(
    file: string,
    model: GameBlueprint,
    policy: OptimizationPolicy,
    signal?: AbortSignal,
    onValidationWork?: (count: number) => void,
): Promise<void> {
    const sourceGame = createTunableBlueprintGame(model);
    let library;
    try {
        library = await generateExactWeightedOutcomeLibrary({
            game: selectStake(sourceGame, policy.stake),
            libraryId: "wasm-proof",
            pokieVersion: "1.3.0",
            stake: policy.stake,
            exact: true,
            maxOutcomeSpaceSize: BigInt(policy.maxOutcomes),
            signal,
            onProgress: onValidationWork ? count => onValidationWork(Number(count)) : undefined,
            now: () => new Date(0),
        });
    } finally {
        if (sourceGame.release) await releaseOwnedRuntime(() => sourceGame.release!());
    }
    const expected = new Map(
        library.library.outcomes.map((outcome) => [JSON.stringify(outcome.artifact.screen), outcome.artifact.totalWin]),
    );
    const strips = model.reelStrips!;
    const count = strips.reduce((total, strip) => total * strip.length, 1);
    if (count > policy.maxOutcomes) throw new OptimizationUnsupportedError("WASM exact population exceeds maxOutcomes.");
    let draws: number[] = [];
    const runtime = await loadPokieWasmFileRuntime(file, {
        nextRandom: () => {
            if (!draws.length) throw new Error("Unexpected WASM random draw.");
            return draws.shift()!;
        },
    });
    try {
        for (let ordinal = 0; ordinal < count; ordinal++) {
            cancelled(signal);
            let remaining = ordinal;
            draws = strips.map((strip) => {
                const stop = remaining % strip.length;
                remaining = Math.floor(remaining / strip.length);
                return (stop + 0.5) / strip.length;
            });
            const session = runtime.createSession(policy.seed);
            try {
                const round = await session.play({bet: policy.stake}, {signal});
                if (round.payout !== expected.get(JSON.stringify(round.screen))) throw new Error("Rebuilt WASM executable differs from its exact source population.");
                onValidationWork?.(count + ordinal + 1);
            } finally {
                session.dispose();
            }
        }
    } finally {
        runtime.dispose();
    }
}

function selectStake(game: PokieGame, stake: number): PokieGame {
    return {
        ...game,
        getManifest: () => game.getManifest(),
        getConfigHash: () => game.getConfigHash!(),
        createSession: (context) => {
            const session = game.createSession(context);
            session.setBet(stake);
            return session;
        },
        createExactEnumerationSession: (forced) => {
            const session = game.createExactEnumerationSession!(forced);
            session.setBet(stake);
            return session;
        },
    };
}

async function releaseOwnedRuntime(release: () => Promise<void>): Promise<void> {
    try {
        await release();
    } catch (error) {
        throw new OptimizationCleanupError(`Runtime cleanup failed: ${(error as Error).message}`);
    }
}

async function samplePopulation(
    file: string, targets: MathTarget[], policy: OptimizationPolicy, seed: string, samples: number, returnBound: number,
    options: OptimizationSamplingOptions, recipe?: OptimizationSimulationRecipe,
    loadGame?: (file: string) => Promise<PokieGame>,
    expectedModelId?: string,
): Promise<{statistics: SimulationStatistics; returnBound: number; validationWork: number; stopReason: string}> {
    if (!Number.isFinite(returnBound) || returnBound < 0) throw new OptimizationUnsupportedError("No finite payout bound for sampled assessment.");
    const result = await new ParallelSimulationRunner(file, samples, {
        seed, workers: policy.sampling!.workers, chunkSize: policy.sampling!.chunkSize,
        stake: policy.stake, signal: options.signal, onProgress: options.onProgress, workerEntryUrl: options.workerEntryUrl, requireCleanup: true,
        optimizationRecipe: recipe, loadGame,
        observations: {events: [...new Set(targets.filter(target => target.metric === "featureFrequency").map(target => target.event!))],
            buckets: targets.filter(target => target.metric === "distribution").map(target => target.bucket!)},
    }).run();
    if (expectedModelId && result.configHash !== expectedModelId) throw new Error("Worker executable does not bind the declared tuning model.");
    if (result.statistics.maxWin / result.statistics.averageBet > returnBound + 1e-10) throw new Error("Runtime exceeds the declared payout bound.");
    return {statistics: result.statistics, returnBound, validationWork: 0, stopReason: result.stopReason};
}

/** Native support may contain maxOutcomes entries; reduction uses constant auxiliary memory. */
export function nativeReturnBound(outcomes: readonly {payoutPerBet: number}[], cost: number): number {
    return outcomes.reduce((maximum, outcome) => Math.max(maximum, outcome.payoutPerBet / cost), 0);
}

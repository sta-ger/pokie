import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {validateOptimizationRequest} from "./validateOptimizationRequest.js";
import {checkPolicyPaths, at, put, constraintsHold, assertOnlyTuned, paytablePaths} from "./internal/optimizationModel.js";
import {preflightConstraints} from "./internal/optimizationPreflight.js";
import {assessOptimizationSample, sampledEstimates} from "./internal/assessOptimizationSample.js";
import {optimizationOrder} from "./internal/optimizationOrder.js";
import {createBlueprintWasmArtifact} from "../wasm/createBlueprintWasmArtifact.js";
import {instantiatePokieWasm, SeededPokieWasmHost} from "../wasm/PokieWasmRuntime.js";
import {collectPokieWasmSimulation} from "../wasm/PokieWasmCommands.js";
import {sha256CanonicalWasmBytes} from "../wasm/PokieWasmCanonicalModule.js";
import {stableSlotMathJson} from "../wasm/math/SharedSlotMath.js";
import {MathDefinitionDiffer} from "../diff/MathDefinitionDiffer.js";
import type {DefinitionJson, MathDefinitionSnapshot} from "../diff/MathDefinitionDiff.js";
import type {OptimizationEvidence, OptimizationScalar} from "./OptimizationPolicy.js";

export const browserModelHash = (value: unknown): Promise<string> =>
    sha256CanonicalWasmBytes(new TextEncoder().encode(stableSlotMathJson(JSON.parse(JSON.stringify(value)))));

/** Narrow browser adapter: canonical WASM measurements, shared policy/ordering/held-out assessment.
 * No filesystem authority or package execution is granted by this adapter.
 */
export async function optimizeBrowserBlueprint(
    source: GameBlueprint,
    input: unknown,
    control: {
        signal?: AbortSignal;
        yieldToHost: () => Promise<void>;
        onProgress?: (completed: number, total: number) => void;
    },
) {
    const request = validateOptimizationRequest(input);
    const p = request.policy;
    if (
        p.strategy !== "seeded-search-v1" ||
        p.scope !== "paid-entry" ||
        p.mode !== "base" ||
        p.protectedFiles?.length ||
        source.betModes?.length ||
        source.screenGeometry ||
        source.reelSequences ||
        !source.reelStrips ||
        Object.keys(source.mechanics ?? {}).length ||
        source.wilds?.length ||
        source.scatters?.length ||
        (source.winModel && source.winModel.type !== "lines") ||
        request.targets.some((t) => !["rtp", "hitFrequency"].includes(t.metric)) ||
        p.constraints?.maxWin
    ) throw new Error(
        "unsupported: browser tuning supports sampled base paid-entry line paytables with literal reels, RTP/hit targets and no feature, max-win or filesystem constraints.",
    );
    if (!(source.availableBets ?? []).includes(p.stake)) throw new Error("invalid: optimization stake must be an authored bet.");
    const sampling = p.sampling!;
    if (
        p.budget > 16 ||
        sampling.searchSamples > 2048 ||
        sampling.searchBudget > 8192 ||
        sampling.assessmentSamples > 8192 ||
        sampling.workers !== 1 ||
        p.tunables.length > 4
    ) throw new Error(
        "invalid: playground limits are 16 candidates, 8192 search/assessment samples, 2048 per candidate, four tunables and one Worker.",
    );
    checkPolicyPaths(source, p, paytablePaths(source));
    preflightConstraints(source, p);
    for (const field of p.tunables) if (field.values.some((v) => typeof v !== "number" || v > 100)) throw new Error("invalid: browser paytable domains require numeric values at most 100.");
    const domain = p.tunables.reduce((n, f) => n * BigInt(f.values.length), BigInt(1));
    const order = optimizationOrder(await browserModelHash([p.seed, "start"]), await browserModelHash([p.seed, "stride"]), domain);
    const sourceRevision = await browserModelHash(source);
    const requestRevision = await browserModelHash(request);
    let consumedWork = 0,
        searchSamples = 0,
        assessmentSamples = 0;
    const evaluations: NonNullable<OptimizationEvidence["evaluations"]> = [];
    let best: {model: GameBlueprint; parameters: Record<string, OptimizationScalar>; measured: number[]; fitness: number} | undefined;
    const current = (): void => {
        if (control.signal?.aborted) throw new Error("cancelled: optimization drained");
    };
    const sample = async (model: GameBlueprint, count: number, seed: string, assessment: boolean) => {
        current();
        const artifact = await createBlueprintWasmArtifact(model);
        const runtime = await instantiatePokieWasm(artifact.bytes, artifact.manifest, new SeededPokieWasmHost(seed));
        try {
            const [result] = await collectPokieWasmSimulation(runtime, seed, count, {
                bet: p.stake,
                signal: control.signal,
                chunkSize: sampling.chunkSize,
                yieldToHost: control.yieldToHost,
                observations: {events: [], buckets: []},
                onProgress: (done) => {
                    control.onProgress?.(searchSamples + assessmentSamples + done, sampling.searchBudget + sampling.assessmentSamples);
                },
            });
            if (assessment) assessmentSamples += result.statistics.rounds;
            else searchSamples += result.statistics.rounds;
            return result.statistics;
        } finally {
            runtime.dispose();
        }
    };
    for (let attempt = BigInt(0); attempt < domain && consumedWork < p.budget && searchSamples < sampling.searchBudget; attempt++) {
        current();
        const model = JSON.parse(JSON.stringify(source)) as GameBlueprint;
        const parameters: Record<string, OptimizationScalar> = {};
        let index = (order.start + attempt * order.stride) % domain;
        for (const field of [...p.tunables].reverse()) {
            const value = field.values[Number(index % BigInt(field.values.length))];
            index /= BigInt(field.values.length);
            put(model, field.path, value);
            parameters[field.path] = value;
        }
        consumedWork++;
        if (!constraintsHold(model, p)) {
            evaluations.push({parameters, verdict: "constraint-rejected"});
            continue;
        }
        assertOnlyTuned(source, model, p, model);
        const seed = JSON.stringify([p.seed, "search", consumedWork]);
        const statistics = await sample(model, Math.min(sampling.searchSamples, sampling.searchBudget - searchSamples), seed, false);
        const measured = sampledEstimates(request.targets, statistics);
        const fitness = request.targets.reduce(
            (sum, t, i) => sum + ((measured[i] - t.value) / Math.max(t.tolerance?.value ?? 0, Math.abs(t.value), 1)) ** 2,
            0,
        );
        evaluations.push({parameters, measured, seed, samples: statistics.rounds, fitness, verdict: "evaluated"});
        if (!best || fitness < best.fitness) best = {model, parameters, measured, fitness};
        await control.yieldToHost();
    }
    current();
    const exhaustive = BigInt(consumedWork) === domain;
    let stopReason: OptimizationEvidence["stopReason"] = "search-budget";
    if (exhaustive) stopReason = "domain-complete";
    else if (consumedWork >= p.budget) stopReason = "candidate-budget";
    const evidence: OptimizationEvidence = {
        version: 1,
        sourceRevision,
        adapter: "blueprint:browser-wasm-v1",
        strategy: p.strategy,
        request,
        domainSize: String(domain),
        consumedWork,
        evaluated: evaluations.filter((e) => e.verdict === "evaluated").length,
        rejected: evaluations.filter((e) => e.verdict === "constraint-rejected").length,
        exhaustive,
        numericRepresentation: "IEEE-754 binary64 moments; native integer weights preserved",
        evaluations,
        stopReason,
    };
    if (!best) return {
        status: exhaustive ? "infeasible" : "exhausted",
        stopReason,
        sourceRevision,
        requestRevision,
        request,
        consumedWork,
        searchSamples,
        evaluations,
        evidence,
    };
    // Structural support bound for simple line payouts, never a sample maximum.
    const bound =
        Math.max(0, ...Object.values(best.model.paytable).flatMap((row) => Object.values(row))) *
        (best.model.paylines?.length ?? best.model.rows);
    const assessmentSeed = JSON.stringify([p.seed, "assessment", 0]);
    const statistics = await sample(best.model, sampling.assessmentSamples, assessmentSeed, true);
    const assessment = assessOptimizationSample(request, statistics, bound, assessmentSeed, "maxRounds");
    const candidateRevision = await browserModelHash(best.model);
    const snapshot = (model: GameBlueprint, revision: string): MathDefinitionSnapshot => ({
        identity: {kind: "blueprint", revision},
        support: "complete",
        fields: [],
        diagnostics: [],
        limits: [],
        authored: model as unknown as DefinitionJson,
        effective: {
            ...model,
            maxWinPolicy: {type: "none", scope: "logical-round", authority: "Blueprint runtime has no payout cap"},
        } as unknown as DefinitionJson,
    });
    const definitionDiff = new MathDefinitionDiffer().diff(snapshot(source, sourceRevision), snapshot(best.model, candidateRevision));
    const diff = p.tunables.map((f) => ({
        path: f.path,
        before: at(source, f.path) as OptimizationScalar,
        after: at(best!.model, f.path) as OptimizationScalar,
    }));
    Object.assign(evidence, {
        phase: "finalizing",
        diff,
        definitionDiff: {status: definitionDiff.status, scope: definitionDiff.scope, changes: definitionDiff.changes},
        selected: best.parameters,
        measured: best.measured,
        constraintChecks: [
            "declared writable fields",
            "locked subtrees",
            "fixed weights/counts/sums",
            "artifact-bound runtime measurements",
        ],
        outputValidation: "same-type Blueprint; canonical compiled WASM search and independent held-out assessment",
        stochastic: {
            policyVersion: "bounded-hoeffding-bonferroni-v1",
            ordering: "seeded-affine-cartesian-v1;first-minimum-score",
            seedDerivation: "JSON([seed,phase,attempt]); worker seeds use WorkerSeedStrategy",
            workers: 1,
            searchSamples,
            assessmentSamples,
            validationWork: 0,
            modelRevision: sourceRevision,
            searchStopReason: stopReason,
            fitness: best.fitness,
            assessment,
        },
    });
    const attained = assessment.targets.every((t) => t.verdict === "attained");
    let status = "exhausted";
    if (exhaustive) status = attained ? "attained" : "inconclusive";
    return {
        status,
        stopReason,
        type: "blueprint",
        sourceRevision,
        requestRevision,
        candidateRevision,
        candidate: best.model,
        request,
        evidence,
        domainSize: String(domain),
        consumedWork,
        exhaustive,
        searchSamples,
        assessmentSamples,
        evaluations,
        population: {scope: p.scope, unit: "paid-entry", workers: 1},
        confidenceLevel: sampling.confidence,
        assessment,
        diff,
        definitionDiff,
    };
}

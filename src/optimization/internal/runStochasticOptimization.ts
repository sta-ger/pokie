import {optimizationOrder} from "./optimizationOrder.js";
import {sampledEstimates, assessOptimizationSample} from "./assessOptimizationSample.js";
import fs from "fs";
import path from "path";
import {MathDefinitionSourceReader} from "../../diff/MathDefinitionSourceReader.js";
import {MathDefinitionDiffer} from "../../diff/MathDefinitionDiffer.js";
import type {PokieProject} from "../../project/PokieProject.js";
import {ProjectTargetResolver} from "../../project/ProjectTargetResolver.js";
import type {SimulationStatistics} from "../../simulation/SimulationStatistics.js";
import type {OptimizationCandidate, OptimizationEvidence, OptimizationOptions, OptimizationRequest, OptimizationResult, OptimizationScalar} from "../OptimizationPolicy.js";
import {OptimizationCancelledError, type ProjectOptimizationAdapting} from "./ProjectOptimizationAdapter.js";
import {assertOnlyTuned, at, constraintsHold, jsonHash, packageExecutableRevision, projectRevision, put, sourceInventory} from "./optimizationData.js";

export {sampledEstimates, assessOptimizationSample} from "./assessOptimizationSample.js";

export function stochasticOrder(seed: string, size: bigint): {start: bigint; stride: bigint} {
    return optimizationOrder(jsonHash([seed, "start"]), jsonHash([seed, "stride"]), size);
}
export async function runStochasticOptimization(
    project: PokieProject, request: OptimizationRequest, adapter: ProjectOptimizationAdapting,
    workspace: string, evidence: OptimizationEvidence, inventory: Record<string, string>, options: OptimizationOptions,
): Promise<OptimizationResult> {
    const sampling = request.policy.sampling!;
    const domain = BigInt(evidence.domainSize);
    const order = stochasticOrder(request.policy.seed, domain);
    const originalModel = jsonHash(adapter.model);
    evidence.stochastic = {policyVersion: "bounded-hoeffding-bonferroni-v1", ordering: "seeded-affine-cartesian-v1;first-minimum-score",
        seedDerivation: "JSON([seed,phase,attempt]); worker seeds use WorkerSeedStrategy", workers: sampling.workers,
        searchSamples: 0, assessmentSamples: 0, validationWork: 0, modelRevision: originalModel};
    if (project.type === "tsPackage") {
        const executableRevision = await packageExecutableRevision(project.rootPath);
        Object.assign(evidence.stochastic, {executableRevision});
    }
    const assertExecutable = async (file: string): Promise<void> => {
        if (project.type === "tsPackage" && await packageExecutableRevision(file) !== evidence.stochastic!.executableRevision) throw new Error("Executable dependencies changed or are unavailable; rerun optimization.");
    };
    let best: {candidate: OptimizationCandidate; model: unknown; score: number; parameters: Record<string, OptimizationScalar>; measured: number[]} | undefined;
    const current = (): void => {
        if (options.signal?.aborted) throw new OptimizationCancelledError("Optimization cancelled; owned execution drained.");
        if (options.isCurrent && !options.isCurrent()) throw new Error("Project/request changed during optimization.");
        if (projectRevision(project) !== evidence.sourceRevision) throw new Error("Source changed during optimization.");
    };
    const progress = (): void => {
        current();
        options.onProgress?.(structuredClone(evidence));
        current();
    };
    const sample = async (file: string, model: unknown, count: number, seed: string, assessment: boolean) => {
        let completed = 0;
        let validated = 0;
        const validationWork = (actual: number): void => {
            if (!Number.isSafeInteger(actual) || actual < validated) throw new Error("Invalid executable validation accounting.");
            evidence.stochastic!.validationWork += actual - validated;
            validated = actual;
            progress();
        };
        const update = (actual: number): void => {
            if (!Number.isSafeInteger(actual) || actual < completed || actual > count) throw new Error("Invalid simulation work accounting.");
            if (assessment) evidence.stochastic!.assessmentSamples += actual - completed;
            else evidence.stochastic!.searchSamples += actual - completed;
            completed = actual;
        };
        try {
            await assertExecutable(project.rootPath);
            await assertExecutable(file);
            current();
            const result = await adapter.sample(file, model, request.targets, request.policy, seed, count, {
                signal: options.signal, workerEntryUrl: options.workerEntryUrl,
                onProgress: actual => {
                    update(actual);
                    progress();
                },
                onValidationWork: validationWork,
            });
            update(result.statistics.rounds);
            await assertExecutable(project.rootPath);
            await assertExecutable(file);
            validationWork(result.validationWork);
            current();
            return result;
        } catch (error) {
            const prefix = (error as {observedPrefix?: SimulationStatistics}).observedPrefix;
            if (prefix && prefix.rounds >= completed) update(prefix.rounds);
            throw error;
        }
    };
    Object.assign(evidence, {phase: "search"});
    let stop: OptimizationEvidence["stopReason"] = "domain-complete";
    for (let attempt = BigInt(0); attempt < domain; attempt++) {
        current();
        if (evidence.consumedWork >= request.policy.budget) {
            stop = "candidate-budget";
            break;
        }
        if (evidence.stochastic.searchSamples >= sampling.searchBudget) {
            stop = "search-budget";
            break;
        }
        const model = JSON.parse(JSON.stringify(adapter.model)) as unknown;
        let index = (order.start + attempt * order.stride) % domain;
        const parameters: Record<string, OptimizationScalar> = {};
        for (const field of [...request.policy.tunables].reverse()) {
            const value = field.values[Number(index % BigInt(field.values.length))];
            index /= BigInt(field.values.length);
            put(model, field.path, value);
            parameters[field.path] = value;
        }
        evidence.consumedWork++;
        evidence.exhaustive = BigInt(evidence.consumedWork) === domain;
        if (!constraintsHold(model, request.policy)) {
            evidence.rejected++;
            evidence.evaluations!.push({parameters, verdict: "constraint-rejected"});
            progress();
            continue;
        }
        const directory = path.join(workspace, `candidate-${evidence.consumedWork}`);
        Object.assign(evidence, {phase: "preparing"});
        progress();
        fs.mkdirSync(directory);
        const file = await adapter.materialize(model, directory, options.signal);
        current();
        const resolved = await new ProjectTargetResolver().resolve(file, {readConfigurationProvenance: false});
        if (!resolved || resolved.type !== project.type) throw new Error("Candidate did not resolve as the original ProjectType.");
        const readback = await adapter.read(file);
        assertOnlyTuned(adapter.model, readback, request.policy, model);
        const candidateInventory = sourceInventory(resolved);
        for (const protectedFile of request.policy.protectedFiles ?? []) if (candidateInventory[protectedFile] !== inventory[protectedFile]) throw new Error(`Protected bytes changed: ${protectedFile}`);
        const revision = projectRevision(resolved);
        const samples = Math.min(sampling.searchSamples, sampling.searchBudget - evidence.stochastic.searchSamples);
        const seed = JSON.stringify([request.policy.seed, "search", evidence.consumedWork]);
        Object.assign(evidence, {phase: "search"});
        const result = await sample(file, readback, samples, seed, false);
        if (projectRevision(resolved) !== revision) throw new Error("Simulation changed candidate bytes.");
        const measured = sampledEstimates(request.targets, result.statistics);
        if (measured.some(value => !Number.isFinite(value))) throw new Error("Nonfinite search estimate.");
        evidence.evaluated++;
        const score = request.targets.reduce((sum, target, index) => sum + ((measured[index] - target.value) / Math.max(target.tolerance?.value ?? 0, Math.abs(target.value), 1)) ** 2, 0);
        evidence.evaluations!.push({parameters, measured, seed, samples: result.statistics.rounds, fitness: score, verdict: "evaluated"});
        if (!best || score < best.score) {
            if (best) fs.rmSync(path.dirname(best.candidate.path), {recursive: true, force: true});
            best = {model: readback, score, parameters, measured, candidate: {path: file, type: project.type, revision,
                sourcePath: project.rootPath, sourceRevision: evidence.sourceRevision, requestRevision: jsonHash(request), workspace}};
        } else fs.rmSync(directory, {recursive: true, force: true});
        progress();
        await new Promise<void>(resolve => {
            setImmediate(resolve);
        });
    }
    current();
    Object.assign(evidence, {stopReason: stop});
    Object.assign(evidence.stochastic, {searchStopReason: stop});
    if (!best) {
        if (evidence.exhaustive) evidence.stopReason = "no-valid-candidate";
        return {status: evidence.exhaustive ? "infeasible" : "exhausted", diagnostics: [{path: "constraints", message: evidence.exhaustive ? "All declared candidates excluded by structural constraints; no target samples evaluated." : "No valid candidate before deterministic budget ended."}], evidence};
    }
    evidence.selected = best.parameters;
    evidence.measured = best.measured;
    evidence.stochastic.fitness = best.score;
    evidence.diff = request.policy.tunables.map(field => ({path: field.path, before: at(adapter.model, field.path) as OptimizationScalar, after: best!.parameters[field.path]}));
    evidence.constraintChecks = ["declared writable fields", "locked subtrees", "fixed weights/counts/sums", "protected source bytes"];
    evidence.outputValidation = "same-type resolver, native readback, attempted values, source/executable authority, bounded sampled metrics; candidate is not approval";
    if (!["outcomeLibrary", "stakeAdapter"].includes(project.type)) {
        const reader = new MathDefinitionSourceReader();
        const before = await reader.read({kind: "blueprint", model: adapter.model}, {analysisOnly: true, signal: options.signal});
        const after = await reader.read({kind: "blueprint", model: best.model}, {analysisOnly: true, signal: options.signal});
        const {status, scope, changes} = new MathDefinitionDiffer().diff(before, after);
        Object.assign(evidence, {definitionDiff: {status, scope, changes}});
        current();
    }
    // Freeze selection before touching the independent held-out stream.
    Object.assign(evidence, {phase: "assessment"});
    progress();
    const seed = JSON.stringify([request.policy.seed, "assessment", 0]);
    const assessment = await sample(best.candidate.path, best.model, sampling.assessmentSamples, seed, true);
    if (projectRevision({type: project.type, rootPath: best.candidate.path}) !== best.candidate.revision) throw new Error("Assessment changed candidate bytes.");
    const assessed = assessOptimizationSample(request, assessment.statistics, assessment.returnBound, seed, assessment.stopReason);
    Object.assign(evidence.stochastic, {assessment: assessed});
    Object.assign(evidence, {phase: "finalizing"});
    const exhausted = stop !== "domain-complete" || assessment.statistics.rounds < sampling.minSamples || assessment.statistics.rounds !== sampling.assessmentSamples;
    const attained = assessed.targets.every(target => target.verdict === "attained");
    if (assessment.statistics.rounds < sampling.minSamples || assessment.statistics.rounds !== sampling.assessmentSamples) evidence.stopReason = "assessment-budget";
    else if (stop === "domain-complete") evidence.stopReason = "assessment-complete";
    progress();
    let status: OptimizationResult["status"] = "inconclusive";
    if (exhausted) status = "exhausted";
    else if (attained) status = "attained";
    return {status, diagnostics: [], evidence, candidate: best.candidate};
}

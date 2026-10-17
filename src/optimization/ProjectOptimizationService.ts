import {WeightedOutcomeLibraryGenerationError} from "../weightedoutcome/generate/WeightedOutcomeLibraryGenerationError.js";
import {WeightedOutcomeLibraryGenerationCancelledError} from "../weightedoutcome/generate/WeightedOutcomeLibraryGenerationCancelledError.js";
import {OutcomeLibraryBundleWriteCancelledError} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriting.js";
import fs from "fs";
import path from "path";
import type {PokieProject} from "../project/PokieProject.js";
import {ProjectTargetResolver} from "../project/ProjectTargetResolver.js";
import {assertArtifactDestinationAvailable} from "../project/internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "../project/internal/assertArtifactDestinationIsSafe.js";
import {ArtifactPublicationOwnership, rollbackArtifactPublication} from "../project/ArtifactPublicationOwnership.js";
import type {
    MathTarget,
    OptimizationCandidate,
    OptimizationEvidence,
    OptimizationOptions,
    OptimizationPolicy,
    OptimizationRequest,
    OptimizationResult,
    OptimizationScalar,
    ProjectOptimizing,
} from "./OptimizationPolicy.js";
import {
    OptimizationInputError,
    optimizationPathsOverlap,
    validateOptimizationRequest,
} from "./validateOptimizationRequest.js";
import {
    acquireOptimizationAdapter,
    OptimizationCancelledError,
    OptimizationCleanupError,
    OptimizationExhaustedError,
    OptimizationUnsupportedError,
} from "./internal/ProjectOptimizationAdapter.js";
import {
    assertNoFilesystemAliases,
    assertOnlyTuned,
    at,
    checkPolicyPaths,
    constraintsHold,
    digest,
    jsonHash,
    projectRevision,
    put,
    sourceInventory,
} from "./internal/optimizationData.js";

export const OPTIMIZATION_EXIT_CODES = {
    success: 0,
    infeasible: 2,
    invalid: 3,
    unsupported: 4,
    exhausted: 5,
    cancelled: 6,
    failure: 1,
} as const;
export interface OptimizationCandidatePublishing {
    publish(
        candidate: OptimizationCandidate,
        request: unknown,
        destination: string,
        options?: OptimizationOptions,
    ): Promise<string>;
    discard(candidate: OptimizationCandidate): Promise<void>;
}
function preflightConstraints(model: unknown, policy: OptimizationPolicy): void {
    const invalid = (path: string, message: string): never => {
        throw new OptimizationInputError([{path, message}]);
    };
    for (const fixed of policy.constraints?.fixed ?? []) {
        if (policy.tunables.some((field) => optimizationPathsOverlap(field.path, fixed.path))) invalid(fixed.path, "Fixed field overlaps a tunable.");
        if (at(model, fixed.path) !== fixed.value) invalid(fixed.path, "Fixed field contradicts source.");
    }
    for (const count of policy.constraints?.counts ?? []) if (Object.keys(at(model, count.path) as object).length !== count.value) invalid(count.path, "Fixed count contradicts this adapter's preserved population.");
    for (const sum of policy.constraints?.sums ?? []) {
        const ranges = sum.paths.map(
            (field) =>
                policy.tunables.find((t) => t.path === field)?.values ?? [at(model, field) as OptimizationScalar],
        );
        if (typeof sum.value === "string") {
            if (ranges.some((values) => values.some((value) => typeof value !== "string"))) invalid("policy/constraints/sums", "Integer sum requires uint64 string weights.");
            const min = ranges.reduce(
                (total, values) => total + values.map((value) => BigInt(value)).reduce((a, b) => (a < b ? a : b)),
                BigInt(0),
            );
            const max = ranges.reduce(
                (total, values) => total + values.map((value) => BigInt(value)).reduce((a, b) => (a > b ? a : b)),
                BigInt(0),
            );
            if (BigInt(sum.value) < min || BigInt(sum.value) > max) invalid("policy/constraints/sums", "Sum contradicts finite domains/fixed weights.");
        } else {
            if (ranges.some((values) => values.some((value) => typeof value !== "number"))) invalid("policy/constraints/sums", "Numeric sum requires numeric leaves.");
            const min = ranges.reduce((total, values) => total + Math.min(...(values as number[])), 0);
            const max = ranges.reduce((total, values) => total + Math.max(...(values as number[])), 0);
            if (sum.value < min || sum.value > max) invalid("policy/constraints/sums", "Sum contradicts finite domains/fixed weights.");
        }
    }
}
function targetsMatch(targets: MathTarget[], measured: number[]): boolean {
    return targets.every((target, index) => {
        const tolerance = target.tolerance?.value ?? 0;
        const allowance = target.tolerance?.kind === "relative" ? Math.abs(target.value) * tolerance : tolerance;
        return Number.isFinite(measured[index]) && Math.abs(measured[index] - target.value) <= allowance;
    });
}
/** Stable authored domain order and first-match tie breaking. Seed is recorded; exact enumeration uses no random selection. */
export class ProjectOptimizationService implements ProjectOptimizing, OptimizationCandidatePublishing {
    private readonly receipts = new Map<string, {candidate: OptimizationCandidate; request: OptimizationRequest}>();
    private readonly scratchRoot: string;
    public constructor(scratchRoot = path.resolve("node_modules/.cache/pokie-optimization")) {
        this.scratchRoot = scratchRoot;
    }

    public async support(
        project: PokieProject,
        request: unknown,
    ): Promise<{supported: boolean; reason: string; adapter: string; writable?: string[]}> {
        try {
            const validated = validateOptimizationRequest(request);
            assertNoFilesystemAliases(project.rootPath);
            validateProtectedFiles(project, validated.policy, sourceInventory(project));
            const adapter = await acquireOptimizationAdapter(project, validated.policy);
            checkPolicyPaths(adapter.model, validated.policy, adapter.writable);
            preflightConstraints(adapter.model, validated.policy);
            return {
                supported: true,
                reason: "Supported finite same-type workflow; target authority is limited to the submitted scope.",
                adapter: `${project.type}:v1`,
                writable: adapter.writable,
            };
        } catch (error) {
            return {
                supported: false,
                reason: error instanceof Error ? error.message : String(error),
                adapter: `${project.type}:v1`,
            };
        }
    }

    public async optimize(
        project: PokieProject,
        input: unknown,
        options: OptimizationOptions = {},
    ): Promise<OptimizationResult> {
        let workspace: string | undefined;
        let evidence: OptimizationEvidence | undefined;
        let keep = false;
        let result: OptimizationResult;
        const assertCurrent = (): void => {
            if (options.isCurrent && !options.isCurrent()) throw new Error("Project/request changed during optimization; discard stale result.");
        };
        try {
            assertCurrent();
            const request = validateOptimizationRequest(input);
            if (options.signal?.aborted) throw new OptimizationCancelledError("Cancelled before acquisition.");
            assertNoFilesystemAliases(project.rootPath);
            const sourceRevision = projectRevision(project);
            const inventory = sourceInventory(project);
            validateProtectedFiles(project, request.policy, inventory);
            const adapter = await acquireOptimizationAdapter(project, request.policy);
            assertCurrent();
            if (options.signal?.aborted) throw new OptimizationCancelledError("Cancelled during acquisition.");
            try {
                checkPolicyPaths(adapter.model, request.policy, adapter.writable);
            } catch (error) {
                throw new OptimizationInputError([{path: "policy", message: (error as Error).message}]);
            }
            preflightConstraints(adapter.model, request.policy);
            const domainSize = request.policy.tunables.reduce(
                (total, field) => total * BigInt(field.values.length),
                BigInt(1),
            );
            evidence = {
                version: 1,
                sourceRevision,
                adapter: `${project.type}:v1`,
                strategy: "exact-finite-v1",
                request,
                domainSize: domainSize.toString(),
                evaluated: 0,
                rejected: 0,
                consumedWork: 0,
                exhaustive: false,
                numericRepresentation: "IEEE-754 binary64 moments; native integer weights preserved",
                evaluations: [],
            };
            fs.mkdirSync(this.scratchRoot, {recursive: true});
            workspace = fs.mkdtempSync(path.join(this.scratchRoot, "run-"));
            let ordinal = BigInt(0);
            let selected: OptimizationCandidate | undefined;
            while (ordinal < domainSize && evidence.consumedWork < request.policy.budget) {
                if (options.signal?.aborted) throw new OptimizationCancelledError("Cancelled during finite search.");
                const model = JSON.parse(JSON.stringify(adapter.model)) as unknown;
                const selection: Record<string, OptimizationScalar> = {};
                let remaining = ordinal;
                // Last authored dimension varies fastest: stable Cartesian product order.
                for (const field of [...request.policy.tunables].reverse()) {
                    const value = field.values[Number(remaining % BigInt(field.values.length))];
                    remaining /= BigInt(field.values.length);
                    put(model, field.path, value);
                    selection[field.path] = value;
                }
                evidence.consumedWork++;
                ordinal++;
                if (!constraintsHold(model, request.policy)) {
                    evidence.rejected++;
                    evidence.evaluations!.push({parameters: selection, verdict: "constraint-rejected"});
                } else {
                    const directory = path.join(workspace, `candidate-${evidence.consumedWork}`);
                    fs.mkdirSync(directory);
                    const file = await adapter.materialize(model, directory, options.signal);
                    if (options.signal?.aborted) throw new OptimizationCancelledError("Cancelled during candidate materialization.");
                    const resolved = await new ProjectTargetResolver().resolve(file, {readConfigurationProvenance: false});
                    if (!resolved || resolved.type !== project.type) throw new Error("Candidate did not resolve as the original ProjectType.");
                    const readback = await adapter.read(file);
                    assertOnlyTuned(adapter.model, readback, request.policy, model);
                    assertCurrent();
                    const candidateInventory = sourceInventory(resolved);
                    for (const protectedFile of request.policy.protectedFiles ?? []) if (candidateInventory[protectedFile] !== inventory[protectedFile]) throw new Error(`Protected source bytes changed: ${protectedFile}`);
                    const serializedRevision = projectRevision(resolved);
                    const maxConstraint = request.policy.constraints?.maxWin;
                    const evaluatedTargets = maxConstraint
                        ? [
                            ...request.targets,
                            {metric: "maxWin" as const, unit: maxConstraint.unit, value: maxConstraint.value},
                        ]
                        : request.targets;
                    const measured = await adapter.measure(
                        file,
                        readback,
                        evaluatedTargets,
                        request.policy,
                        options.signal,
                    );
                    assertCurrent();
                    if (projectRevision(resolved) !== serializedRevision) throw new Error("Executable evaluation changed candidate bytes.");
                    if (measured.some((value) => !Number.isFinite(value))) throw new Error("Metric authority returned a nonfinite result.");
                    evidence.evaluated++;
                    evidence.outputValidation =
                        "same-type resolver, native readback, undeclared-field comparison and recomputed runtime/native metrics";
                    const passesMax = !maxConstraint || measured[measured.length - 1] <= maxConstraint.value;
                    evidence.evaluations!.push({
                        parameters: selection,
                        measured,
                        verdict: passesMax && targetsMatch(request.targets, measured) ? "selected" : "target-missed",
                    });
                    if (passesMax && targetsMatch(request.targets, measured)) {
                        if (projectRevision(project) !== sourceRevision) throw new Error("Source changed during optimization; discard stale result.");
                        selected = {
                            path: file,
                            type: project.type,
                            revision: projectRevision(resolved),
                            sourcePath: project.rootPath,
                            sourceRevision,
                            requestRevision: jsonHash(request),
                            workspace,
                        };
                        evidence.diff = request.policy.tunables.map((field) => ({
                            path: field.path,
                            before: at(adapter.model, field.path) as OptimizationScalar,
                            after: selection[field.path],
                        }));
                        evidence.selected = selection;
                        evidence.measured = measured.slice(0, request.targets.length);
                        evidence.constraintChecks = [
                            "declared writable fields",
                            "locked subtrees",
                            "fixed weights/counts/sums",
                            "protected source bytes",
                            ...(maxConstraint ? ["maximum win bound"] : []),
                        ];
                        evidence.outputValidation =
                            "same-type resolver, native readback, undeclared-field comparison and recomputed runtime/native metrics";
                    } else fs.rmSync(directory, {recursive: true, force: true});
                }
                evidence.exhaustive = ordinal === domainSize;
                options.onProgress?.(structuredClone(evidence));
                // Yield to cancellation without making wall time a search budget.
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
                if (options.signal?.aborted) throw new OptimizationCancelledError("Cancelled before terminal result.");
                assertCurrent();
                if (selected) {
                    this.receipts.set(selected.path, {
                        candidate: structuredClone(selected),
                        request: structuredClone(request),
                    });
                    keep = true;
                    return {status: "success", diagnostics: [], evidence, candidate: selected};
                }
            }
            if (projectRevision(project) !== sourceRevision) throw new Error("Source changed during optimization; result is stale.");
            result = {status: evidence.exhaustive ? "infeasible" : "exhausted", diagnostics: [], evidence};
        } catch (error) {
            result = {
                status: classifyOptimizationError(error),
                diagnostics:
                    error instanceof OptimizationInputError
                        ? error.diagnostics
                        : [{path: error instanceof OptimizationCleanupError ? "cleanup" : "$", message: error instanceof Error ? error.message : String(error)}],
                ...(evidence ? {evidence} : {}),
            };
        } finally {
            if (workspace && !keep) {
                // Cleanup failure is operational failure, never infeasibility or successful cancellation.
                try {
                    await fs.promises.rm(workspace, {recursive: true, force: true});
                } catch (error) {
                    result = {
                        status: "failure",
                        diagnostics: [{path: "cleanup", message: (error as Error).message}],
                        evidence,
                    };
                }
            }
        }
        return result!;
    }

    public async publish(
        candidate: OptimizationCandidate,
        input: unknown,
        destination: string,
        options: OptimizationOptions = {},
    ): Promise<string> {
        const request = validateOptimizationRequest(input);
        const receipt = this.receipts.get(candidate.path);
        if (
            !receipt ||
            jsonHash(receipt.candidate) !== jsonHash(candidate) ||
            candidate.requestRevision !== jsonHash(request)
        ) throw new Error("Unknown or modified candidate/policy receipt; optimize again.");
        const source = {type: candidate.type, rootPath: candidate.sourcePath};
        if (
            projectRevision(source) !== candidate.sourceRevision ||
            projectRevision({type: candidate.type, rootPath: candidate.path}) !== candidate.revision
        ) throw new Error("Source or reviewed candidate changed; optimize again.");
        destination = path.resolve(destination);
        assertNoFilesystemAliases(destination);
        assertArtifactDestinationIsSafe(candidate.sourcePath, destination);
        assertArtifactDestinationIsSafe(candidate.path, destination);
        assertArtifactDestinationIsSafe(candidate.workspace, destination);
        assertArtifactDestinationIsSafe(this.scratchRoot, destination);
        const directory = fs.statSync(candidate.path).isDirectory();
        assertArtifactDestinationAvailable(destination, directory ? "directory" : "file");
        const members = [[candidate.path, destination]];
        if (candidate.type === "wasm") for (const suffix of [".pokie-wasm.json", ".tuning.json"]) members.push([`${candidate.path}${suffix}`, `${destination}${suffix}`]);
        for (const [, target] of members) {
            assertArtifactDestinationIsSafe(candidate.sourcePath, target);
            assertArtifactDestinationAvailable(target, directory ? "directory" : "file");
        }
        const publication = new ArtifactPublicationOwnership(true);
        try {
            if (options.signal?.aborted) throw new OptimizationCancelledError("Publication cancelled.");
            if (options.isCurrent && !options.isCurrent()) throw new Error("Project/request changed during publication.");
            for (const [from, to] of members) await publication.publish(from, to, {signal: options.signal});
            if (
                projectRevision(source) !== candidate.sourceRevision ||
                projectRevision({type: candidate.type, rootPath: candidate.path}) !== candidate.revision
            ) throw new Error("Publication revision changed.");
            const reopened = await new ProjectTargetResolver().resolve(destination, {readConfigurationProvenance: false});
            if (reopened?.type !== candidate.type) throw new Error("Published output type drifted.");
            // Optional resolver provenance is not proof of a loadable, measured runtime.
            const adapter = await acquireOptimizationAdapter(reopened, request.policy);
            const readback = await adapter.read(destination);
            const maxConstraint = request.policy.constraints?.maxWin;
            const evaluatedTargets = maxConstraint ? [...request.targets, {metric: "maxWin" as const, unit: maxConstraint.unit, value: maxConstraint.value}] : request.targets;
            const measured = await adapter.measure(destination, readback, evaluatedTargets, request.policy, options.signal);
            if (maxConstraint && measured[measured.length - 1] > maxConstraint.value) throw new Error("Published runtime violates the reviewed maximum win.");
            if (!targetsMatch(request.targets, measured)) throw new Error("Published runtime does not demonstrate the reviewed target.");
            const sameBytes = directory
                ? projectRevision(reopened) === candidate.revision
                : members.every(([from, to]) => digest(fs.readFileSync(from)) === digest(fs.readFileSync(to)));
            if (!sameBytes) throw new Error("Published output bytes drifted.");
            if (options.signal?.aborted) throw new OptimizationCancelledError("Publication cancelled.");
            if (options.isCurrent && !options.isCurrent()) throw new Error("Project/request changed during publication.");
            return destination;
        } catch (error) {
            await rollbackArtifactPublication({
                publishedFileOwnership: publication.files,
                publishedDirectoryOwnership: publication.directories,
            });
            throw error;
        }
    }
    public async discard(candidate: OptimizationCandidate): Promise<void> {
        const receipt = this.receipts.get(candidate.path);
        if (!receipt || receipt.candidate.workspace !== candidate.workspace) throw new Error("Unknown candidate ownership.");
        await fs.promises.rm(candidate.workspace, {recursive: true, force: true});
        this.receipts.delete(candidate.path);
    }
}

function classifyOptimizationError(error: unknown): OptimizationResult["status"] {
    if (error instanceof OptimizationExhaustedError) return "exhausted";
    if (error instanceof OptimizationInputError) return "invalid";
    if (error instanceof OptimizationUnsupportedError) return "unsupported";
    if (
        error instanceof OptimizationCancelledError ||
        error instanceof WeightedOutcomeLibraryGenerationCancelledError ||
        error instanceof OutcomeLibraryBundleWriteCancelledError
    ) return "cancelled";
    if (
        error instanceof WeightedOutcomeLibraryGenerationError &&
        error.getCode() === "weighted-outcome-library-generation-space-exceeded"
    ) return "exhausted";
    return "failure";
}

function validateProtectedFiles(project: PokieProject, policy: OptimizationPolicy, files: Record<string, string>): void {
    if (!policy.protectedFiles?.length) return;
    const writableFiles = new Set<string>();
    if (["blueprint", "parWorkbook", "wasm"].includes(project.type)) for (const file of Object.keys(files)) writableFiles.add(file);
    if (project.type === "tsPackage") {
        writableFiles.add("pokie-tuning.json");
        if (files["pokie-tuning.json"]) {
            const contract = JSON.parse(fs.readFileSync(path.join(project.rootPath, "pokie-tuning.json"), "utf8")) as {parameterFile: string};
            writableFiles.add(contract.parameterFile);
        }
    }
    if (project.type === "outcomeLibrary") {
        const manifest = JSON.parse(fs.readFileSync(path.join(project.rootPath, "manifest.json"), "utf8")) as {files: string[]};
        for (const file of manifest.files) writableFiles.add(file);
        writableFiles.add("manifest.json");
    }
    if (project.type === "stakeAdapter") {
        const index = JSON.parse(fs.readFileSync(path.join(project.rootPath, "index.json"), "utf8")) as {modes: {name: string; weights: string}[]};
        for (const mode of index.modes) if (mode.name === policy.mode) writableFiles.add(mode.weights);
        writableFiles.add("pokie-manifest.json");
        writableFiles.add("pokie-native-weights.json");
    }
    for (const file of policy.protectedFiles) {
        if (!(file in files)) throw new OptimizationInputError([{path: "policy/protectedFiles", message: `Unknown source file ${file}.`}]);
        if (writableFiles.has(file)) throw new OptimizationInputError([{path: "policy/protectedFiles", message: `Byte lock ${file} conflicts with the selected tuning contract.`}]);
    }
}

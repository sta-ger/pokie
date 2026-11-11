import {expect} from "expect";
import {spyOn} from "jest-mock";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {ProjectOptimizationService} from "../../../src/optimization/ProjectOptimizationService.js";
import type {OptimizationRequest, OptimizationResult} from "../../../src/optimization/OptimizationPolicy.js";
import {StudioOptimizationService} from "../../../cli/studio/optimization/StudioOptimizationService.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import type {StudioJobView} from "../../../cli/studio/jobs/StudioJobView.js";
import {SharedSlotMath} from "../../../src/wasm/math/SharedSlotMath.js";

const retainedRequest = (): OptimizationRequest => ({
    targets: [{metric: "rtp", unit: "ratio", value: 0.95, tolerance: {kind: "absolute", value: 0.001}}],
    policy: {strategy: "exact-finite-v1", seed: "optimization-1", budget: 100, maxOutcomes: 100000,
        mode: "base", stake: 1, scope: "paid-entry", tunables: [{path: "/paytable/A/3", values: [1, 2, 3]}], locks: []},
});

/** Same retained workload and assertions, in an ordinary Node host instead of Jest's VM. */
export async function runRetainedOptimization(directory: string, phase: "search" | "apply"): Promise<void> {
    const source = path.join(directory, "blueprint.json");
    const fixture = fs.readFileSync(path.resolve("tests/v2/fixtures/Valera35FeralBlazingSafari.blueprint.json"));
    if (phase === "search") fs.writeFileSync(source, fixture);
    expect(fs.readFileSync(source)).toEqual(fixture);
    const fixtureHash = createHash("sha256").update(fixture).digest("hex");
    const measurementPath = path.join(directory, "measurement.json");
    const startedAt = performance.now();
    const startedCpu = process.cpuUsage();
    const model = JSON.parse(fixture.toString()) as {reelStrips: string[][]};
    expect(model.reelStrips.map(strip => strip.length)).toEqual([36, 36, 36]);
    console.info(`V2C-35 native fixture: sha256=${createHash("sha256").update(fixture).digest("hex")}; 46656 raw stops per candidate.`);
    const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    const service = new StudioOptimizationService(jobs, new ProjectOptimizationService(path.join(directory, "scratch")));
    const context = {projectRoot: source, projectId: source, isCurrent: () => true};
    const request = retainedRequest();
    const support = await service.handle("POST", "support", {expectedProjectRoot: source, request}, context);
    expect(support.body).toMatchObject({supported: true});
    const start = async (input: OptimizationRequest) => {
        const startedAt = performance.now();
        const supported = await service.handle("POST", "support", {expectedProjectRoot: source, request: input}, context);
        const response = await service.handle("POST", "start", {expectedProjectRoot: source, request: input,
            sourceRevision: (supported.body as {sourceRevision: string}).sourceRevision}, context);
        expect(response.status).toBe(202);
        const {job} = response.body as {job: StudioJobView};
        await service.drain();
        const terminal = jobs.get(source, job.id)!;
        console.info(`V2C-35 native job: ${JSON.stringify({elapsedMs: Math.round(performance.now() - startedAt),
            status: terminal.status, result: terminal.result?.detail})}`);
        return terminal;
    };
    try {
        if (phase === "search") {
            // Use the real retained workload and the real host clock: an HTTP
            // handler, like this timer, must run DURING a candidate's artifact
            // execution rather than after its first full evaluation.
            const evaluate = SharedSlotMath.prototype.evaluate;
            let emitted = 0;
            let emittedAtCancellation: number | undefined;
            let observedRecord: StudioJobView | undefined;
            let cancellationStatus: StudioJobView["status"] | undefined;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const evaluating = spyOn(SharedSlotMath.prototype, "evaluate").mockImplementation(function (this: SharedSlotMath, ...args) {
                if (++emitted === 1) timer = setTimeout(() => {
                    const active = jobs.list(source).find(job => job.operation === "optimization" && job.status === "running");
                    emittedAtCancellation = emitted;
                    if (active !== undefined) {
                        observedRecord = new FileStudioJobRepository(path.join(directory, "jobs")).get(active.id);
                        cancellationStatus = jobs.cancel(source, active.id)?.status;
                    }
                }, 0);
                return Reflect.apply(evaluate, this, args);
            });
            try {
                const cancelled = await start(request);
                expect(emittedAtCancellation).toBeGreaterThan(0);
                expect(emittedAtCancellation).toBeLessThan(1000);
                expect(observedRecord).toMatchObject({status: "running", operation: "optimization"});
                expect(cancellationStatus).toBe("cancelling");
                expect(cancelled).toMatchObject({status: "cancelled", result: {detail: {status: "cancelled", evidence: {evaluated: 0}}}});
                expect(new FileStudioJobRepository(path.join(directory, "jobs")).get(cancelled.id)?.status).toBe("cancelled");
                expect(fs.readFileSync(source)).toEqual(fixture);
                expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
                console.info(`V2C-35 active observation and accepted cancellation during first candidate: ${emittedAtCancellation} artifacts; durable cancelled terminal and drained scratch.`);
            } finally {
                clearTimeout(timer);
                evaluating.mockRestore();
            }
            const terminal = await start(request);
            expect(terminal).toMatchObject({status: "completed", result: {detail: {status: "infeasible", diagnostics: [], evidence: {evaluated: 3, consumedWork: 3, exhaustive: true}}}});
            console.info("V2C-35 retained request completed: infeasible; all 3 candidates evaluated without OOM.");
            expect(fs.readFileSync(source)).toEqual(fixture);
            const result = terminal.result!.detail as unknown as OptimizationResult;
            const measured = result.evidence!.evaluations![0].measured![0];
            expect(Number.isFinite(measured)).toBe(true);
            fs.writeFileSync(measurementPath, JSON.stringify({fixtureHash, measured}), {flag: "wx"});
        } else {
            // Only the completed exhaustive search supplies the retry target. The new
            // service still executes and reviews its own real candidate before Apply.
            const measurement = JSON.parse(fs.readFileSync(measurementPath, "utf8")) as {fixtureHash: string; measured: number};
            expect(measurement.fixtureHash).toBe(fixtureHash);
            const {measured} = measurement;
            expect(Number.isFinite(measured)).toBe(true);
            const corrected = retainedRequest();
            corrected.targets[0].value = measured;
            corrected.targets[0].tolerance = {kind: "absolute", value: 0};
            const selected = await start(corrected);
            expect(selected).toMatchObject({status: "completed", result: {detail: {status: "success", evidence: {evaluated: 1, measured: [measured], selected: {"/paytable/A/3": 1}}}}});
            console.info("V2C-35 corrected explicit retry completed: success; candidate /paytable/A/3 = 1.");
            expect(fs.readFileSync(source)).toEqual(fixture);
            const body = {expectedProjectRoot: source, request: corrected, jobId: selected.id};
            expect((await service.handle("POST", "apply", {...body, request}, context)).status).toBe(409);
            expect(fs.readFileSync(source)).toEqual(fixture);
            const applyStartedAt = performance.now();
            expect((await service.handle("POST", "apply", body, context)).status).toBe(200);
            console.info(`V2C-35 native Apply revalidation: ${Math.round(performance.now() - applyStartedAt)}ms.`);
            expect(JSON.parse(fs.readFileSync(source, "utf8")).paytable.A[3]).toBe(1);
            expect(new FileStudioJobRepository(path.join(directory, "jobs")).get(selected.id)!.result).toMatchObject({provenance: {authoredApply: {path: source}}});
            expect((await service.handle("POST", "apply", body, context)).status).toBe(409);
            console.info("V2C-35 reviewed Apply persisted /paytable/A/3 = 1 and its durable marker; repeat Apply rejected.");
        }
    } finally {
        await service.shutdown();
    }
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
    const cpu = process.cpuUsage(startedCpu);
    console.info(`V2C-35 native ${phase} phase: ${Math.round(performance.now() - startedAt)}ms wall; ${Math.round((cpu.user + cpu.system) / 1000)}ms CPU; peak RSS ${process.resourceUsage().maxRSS}.`);
    console.info("V2C-35 shutdown released the retained candidate workspace.");
}

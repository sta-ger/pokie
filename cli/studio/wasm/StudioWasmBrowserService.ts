import crypto from "crypto";
import fs from "fs";
import {ProjectTargetResolver} from "../../../src/project/ProjectTargetResolver.js";
import {readWasmComponentManifest} from "../../../src/project/readWasmComponentManifest.js";
import {readIntegrityBoundCanonicalPokieWasmArtifact} from "../../../src/wasm/PokieWasmCanonicalModule.js";
import type {PokieWasmBrowserArtifact} from "../../../src/wasm/loadPokieWasmBrowserArtifact.js";
import type {PokieWasmWorkerProgress} from "../../../src/wasm/PokieWasmWorkerClient.js";
import {POKIE_WASM_RUNTIME_VERSION, type PokieWasmRound} from "../../../src/wasm/PokieWasmRuntimeApi.js";
import type {PokieWasmReplayObservation} from "../../../src/wasm/PokieWasmReplay.js";
import {projectPokieWasmRoundArtifact} from "../../../src/wasm/projectPokieWasmRoundArtifact.js";
import {projectLogicalRound} from "../../../src/runtime/projectLogicalRound.js";
import {SimulationReportBuilder} from "../../../src/reporting/SimulationReportBuilder.js";
import type {SimulationStatistics} from "../../../src/simulation/SimulationStatistics.js";
import {validateSimulationRequest} from "../simulation/validateSimulationRequest.js";
import {validateReplayRequest} from "../replay/validateReplayRequest.js";
import {validatePlaySessionRequest} from "../runtime/validatePlaySessionRequest.js";
import {validatePlaySpinRequest} from "../runtime/validatePlaySpinRequest.js";
import type {StudioContext} from "../StudioContext.js";
import type {StudioJobService} from "../jobs/StudioJobService.js";
import {isStudioJobTerminal, type StudioJobView, type StudioJobResultView} from "../jobs/StudioJobView.js";
import type {StudioRuntimeSessionView} from "../runtime/StudioRuntimeSessionView.js";
import type {StudioRoundRecorder} from "../runtime/StudioRoundRecorder.js";
import {canonicalStudioProjectIdentity} from "../jobs/canonicalStudioProjectIdentity.js";

type Lease = {job: StudioJobView; owner: string; artifact: PokieWasmBrowserArtifact; context: StudioContext; timer: ReturnType<typeof setTimeout>; prefix?: SimulationStatistics; completed: number; settle: () => void; drained: Promise<void>; publication?: Promise<Reply>};
type SessionLease = {id: string; owner: string; artifact: PokieWasmBrowserArtifact; context: StudioContext; cancelled: boolean; timer: ReturnType<typeof setTimeout>; settle: () => void; drained: Promise<void>};
type Reply = {status: number; body: unknown};
const recovery = {action: "retry" as const, reason: "The browser Worker was interrupted. No execution survives a reload; retry explicitly with the captured inputs."};

/** Server-side durable owner for browser executions. Computation remains in the browser Worker;
 * this owner validates admission/publication, persists existing result DTOs and detects lost owners.
 */
export class StudioWasmBrowserService {
    private readonly generations = new WeakMap<object, string>();
    private readonly leases = new Map<string, Lease>();
    private accepting = true;
    private readonly sessions = new Map<string, SessionLease>();
    private lostSessionCleanup = false;
    private admission = 0;
    private readonly recoveries = new Map<string, Promise<Reply>>();
    private readonly jobs: StudioJobService;
    private readonly recorder: StudioRoundRecorder;
    private readonly leaseMs: number;
    public constructor(jobs: StudioJobService, recorder: StudioRoundRecorder, leaseMs = 10000) {
        this.jobs = jobs;
        this.recorder = recorder;
        this.leaseMs = leaseMs;
    }

    public async artifact(context: StudioContext): Promise<PokieWasmBrowserArtifact> {
        if (!this.accepting) throw new Error("Studio is shutting down. Release the WASM browser session and restart before retrying.");
        if (context.mode !== "project") throw new Error("Open a WASM Project before executing it.");
        const project = await new ProjectTargetResolver().resolve(context.projectRoot);
        if (project?.type !== "wasm") throw new Error("The current Project is not a WASM artifact. Reopen the Project.");
        const read = await readWasmComponentManifest(project);
        if (!read.supported || !read.manifest.artifact) throw new Error("This legacy WASM component is inspection-only. Rebuild a canonical artifact to execute it.");
        const bytes = new Uint8Array(await fs.promises.readFile(project.rootPath));
        // A replacement between reads must never produce a mixed module/sidecar pair.
        await readIntegrityBoundCanonicalPokieWasmArtifact(bytes, read.manifest);
        let generation = this.generations.get(context);
        if (!generation) {
            generation = crypto.randomUUID();
            this.generations.set(context, generation);
        }
        return {projectRoot: project.rootPath, generation, bytes: [...bytes], manifest: read.manifest};
    }

    public async handle(method: string, path: string, value: unknown, context: StudioContext, isCurrent: () => boolean = () => true): Promise<Reply> {
        if (path === "/api/project/wasm/artifact" && method === "GET") return {status: 200, body: await this.artifact(context)};
        if (!record(value)) throw new Error("Supply a WASM browser execution request.");
        if (path === "/api/project/wasm/jobs" && method === "POST") return this.start(value, context, isCurrent);
        const sessionRoute = (/^\/api\/project\/wasm\/sessions\/([A-Za-z0-9_-]+)\/(heartbeat|dispose)$/).exec(path);
        if (sessionRoute) {
            const session = this.sessions.get(sessionRoute[1]);
            if (!session || session.owner !== value.owner || session.artifact.generation !== value.generation || session.artifact.manifest.artifact!.sha256 !== value.artifactIdentity) return {status: 409, body: {error: "The browser session owner changed. Start a new session."}};
            if (sessionRoute[2] === "dispose") {
                clearTimeout(session.timer);
                this.sessions.delete(session.id);
                session.settle();
                return {status: 200, body: {disposed: true}};
            }
            if (!this.accepting || session.cancelled || context !== session.context || !isCurrent()) return {status: 200, body: {cancel: true}};
            try {
                const current = await this.artifact(context);
                if (current.generation !== session.artifact.generation || current.manifest.artifact!.sha256 !== session.artifact.manifest.artifact!.sha256 || !isCurrent()) return {status: 200, body: {cancel: true}};
            } catch {
                return {status: 200, body: {cancel: true}};
            }
            if (this.sessions.get(session.id) !== session) return {status: 200, body: {cancel: true}};
            this.armSession(session);
            return {status: 200, body: {cancel: false}};
        }
        const route = (/^\/api\/project\/wasm\/jobs\/([A-Za-z0-9_-]+)\/(heartbeat|finish)$/).exec(path);
        if (!route) return {status: 404, body: {error: "Unknown WASM browser execution route."}};
        const lease = this.leases.get(route[1]);
        if (!lease && route[2] === "finish" && typeof value.owner === "string" && typeof value.generation === "string" && typeof value.artifactIdentity === "string") {
            const retained = context.mode === "project" ? this.jobs.get(canonicalStudioProjectIdentity(context.projectRoot), route[1]) : undefined;
            if (retained && isStudioJobTerminal(retained.status) && retained.request.browserOwner === value.owner && retained.request.browserGeneration === value.generation && retained.request.artifactIdentity === value.artifactIdentity) {
                const pending = this.recoveries.get(retained.id);
                if (pending) return pending;
                const publication = this.recoverPublication(retained, value, context, isCurrent);
                this.recoveries.set(retained.id, publication);
                try {
                    return await publication;
                } finally {
                    this.recoveries.delete(retained.id);
                }
            }
        }
        if (!lease || lease.owner !== value.owner || lease.artifact.generation !== value.generation || lease.artifact.manifest.artifact!.sha256 !== value.artifactIdentity) return {status: 409, body: {error: "The WASM execution owner, generation or artifact changed. Retry from the current Project."}};
        const job = this.jobs.get(lease.job.projectId, lease.job.id)!;
        if (route[2] === "finish") {
            lease.publication ??= this.finish(lease, value, context, isCurrent);
            return lease.publication;
        }
        if (context !== lease.context || !this.accepting) this.jobs.cancel(job.projectId, job.id);
        // A changed artifact must cancel queued/active computation before publication as well.
        try {
            const current = await this.artifact(context);
            if (current.manifest.artifact!.sha256 !== lease.artifact.manifest.artifact!.sha256 || current.generation !== lease.artifact.generation) this.jobs.cancel(job.projectId, job.id);
        } catch {
            this.jobs.cancel(job.projectId, job.id);
        }
        if (this.leases.get(job.id) !== lease || isStudioJobTerminal(this.jobs.get(job.projectId, job.id)!.status)) return {status: 200, body: {cancel: true}};
        this.arm(lease);
        if (record(value.progress) && Number.isSafeInteger(value.progress.completed) && (value.progress.completed as number) >= lease.completed) {
            const progress = value.progress as PokieWasmWorkerProgress;
            lease.completed = progress.completed;
            if (progress.statistics) lease.prefix = progress.statistics;
            this.jobs.progress(job.id, {stage: "Browser Worker", unit: job.operation === "simulation" ? "accepted plays" : "rounds", current: progress.completed, total: progress.total ?? job.request.rounds as number ?? job.request.round as number ?? 1});
        }
        return {status: 200, body: {cancel: this.jobs.signal(job.id)?.aborted ?? true}};
    }

    public async drain(projectRoot?: string): Promise<void> {
        const leases = [...this.leases.values()].filter(lease => projectRoot === undefined || lease.job.projectId === canonicalStudioProjectIdentity(projectRoot));
        for (const lease of leases) this.jobs.cancel(lease.job.projectId, lease.job.id);
        const sessions = [...this.sessions.values()].filter(session => projectRoot === undefined || canonicalStudioProjectIdentity(session.artifact.projectRoot) === canonicalStudioProjectIdentity(projectRoot));
        for (const session of sessions) session.cancelled = true;
        await Promise.all([...leases.map(lease => lease.drained), ...sessions.map(session => session.drained)]);
    }
    public async shutdown(): Promise<void> {
        this.accepting = false;
        await this.drain();
        if (this.lostSessionCleanup) throw new Error("Studio could not confirm idle browser Worker cleanup. Close the disconnected tab before retrying.");
    }
    private async start(value: Record<string, unknown>, context: StudioContext, isCurrent: () => boolean): Promise<Reply> {
        if (!this.accepting) throw new Error("Studio is shutting down. Restart before submitting work.");
        if (typeof value.owner !== "string" || !(/^[A-Za-z0-9_-]{1,100}$/).test(value.owner) || !record(value.request)) throw new Error("Supply a browser owner and operation inputs.");
        const artifact = await this.artifact(context);
        if (!isCurrent()) throw new Error("WASM Project changed before admission. Reopen and retry.");
        if (value.projectRoot !== artifact.projectRoot || value.generation !== artifact.generation || value.artifactIdentity !== artifact.manifest.artifact!.sha256) throw new Error("The WASM artifact or Project changed. Reopen it before executing.");
        const operation = value.operation;
        if (operation !== "simulation" && operation !== "replay" && operation !== "browser-play") throw new Error("Unavailable WASM browser operation.");
        const declaration = operation === "replay" ? "runtime.replay" : "runtime.play";
        if (!artifact.manifest.capabilities.includes(declaration)) throw new Error(`This WASM artifact does not declare ${declaration}. Rebuild with this capability before ${operation}.`);
        let request: Record<string, unknown>;
        if (operation === "simulation") {
            request = {...validateSimulationRequest(value.request)};
            if (request.convergence || (request.workers as number) > 1) throw new Error("WASM browser simulation supports one Worker and a fixed round budget. Set Workers to 1 and disable adaptive stopping.");
        } else if (operation === "replay") {
            request = {...validateReplayRequest(value.request)};
            if (request.recording || value.request.outcomeSource) throw new Error("Use a WASM recorded round or seed replay for this artifact.");
            if (request.simulationId) {
                const simulation = this.jobs.get(canonicalStudioProjectIdentity(artifact.projectRoot), request.simulationId as string);
                if (simulation?.status !== "completed" || simulation.operation !== "simulation" || simulation.result?.provenance?.artifactIdentity !== artifact.manifest.artifact!.sha256 || simulation.request.seed !== request.seed || simulation.request.modeName !== request.modeName) throw new Error("The selected simulation does not match this WASM artifact, seed and mode. Run a new simulation.");
            }
        } else {
            if (value.request.action !== "new" && value.request.action !== "spin" && value.request.action !== "restore") throw new Error("Unavailable WASM Play action.");
            if (value.request.action === "new") validatePlaySessionRequest(value.request);
            if (value.request.action === "restore" && (!artifact.manifest.capabilities.includes("runtime.serialize") || !record(value.request.state))) throw new Error("This WASM artifact cannot restore state. Supply a compatible JSON checkpoint and rebuild with runtime.serialize.");
            if (value.request.action === "spin") validatePlaySpinRequest(value.request.command as Record<string, unknown> ?? {});
            request = {...value.request};
        }
        request.seed = String(request.seed ?? crypto.randomUUID());
        const started = this.jobs.start({projectId: canonicalStudioProjectIdentity(artifact.projectRoot), operation, request: {...request, artifactIdentity: artifact.manifest.artifact!.sha256, browserOwner: value.owner, browserGeneration: artifact.generation, browserAdmission: ++this.admission}, conflictKey: `${operation}:${canonicalStudioProjectIdentity(artifact.projectRoot)}`, recoveryOnRestart: recovery});
        if (started.status !== "created") return {status: 409, body: {activeJobId: started.status === "conflict" ? started.activeJobId : started.job.id, error: "An execution already owns this operation. Observe or cancel the retained job; another tab cannot resubmit it."}};
        let settle!: () => void;
        const drained = new Promise<void>(resolve => {
            settle = resolve;
        });
        const lease: Lease = {job: started.job, owner: value.owner, artifact, context, timer: undefined!, completed: 0, settle, drained};
        this.leases.set(started.job.id, lease);
        this.arm(lease);
        this.jobs.markRunning(started.job.id);
        return {status: 201, body: {job: this.jobs.get(started.job.projectId, started.job.id), artifact, request}};
    }

    private async finish(lease: Lease, value: Record<string, unknown>, context: StudioContext, isCurrent: () => boolean): Promise<Reply> {
        const job = this.jobs.get(lease.job.projectId, lease.job.id)!;
        if (value.cleanup !== true) throw new Error("Terminate the owned Worker before publishing its terminal result.");
        if (record(value.progress) && Number.isSafeInteger(value.progress.completed) && (value.progress.completed as number) >= lease.completed) {
            lease.completed = value.progress.completed as number;
            if (record(value.progress.statistics)) lease.prefix = value.progress.statistics as SimulationStatistics;
        }
        try {
            const committedPrefix = value.status === "failed" && job.operation === "browser-play" && record(value.output) && value.output.committedProgress === true && record(value.output.round);
            if ((value.status === "completed" || committedPrefix) && !this.jobs.signal(job.id)?.aborted) {
                const current = await this.artifact(context);
                if (!isCurrent() || context !== lease.context || current.generation !== lease.artifact.generation || current.manifest.artifact!.sha256 !== lease.artifact.manifest.artifact!.sha256) throw new Error("WASM Project or artifact changed before completion. Discarded the stale Worker result; reopen and retry.");
                if (this.jobs.signal(job.id)?.aborted) {
                    this.jobs.cancelled(job.id, {summary: "Browser Worker cancelled after cleanup.", detail: {rounds: lease.completed, observedPrefix: lease.prefix}}, recovery);
                    return {status: 200, body: this.jobs.get(job.projectId, job.id)};
                }
                const result = this.result(lease, value.output);
                if (job.operation === "browser-play") this.attachSession(job, lease.owner, lease.artifact, lease.context);
                if (committedPrefix) this.jobs.fail(job.id, typeof value.error === "string" ? value.error : "Browser Play failed after committed progress.", recovery, result);
                else this.jobs.complete(job.id, result);
                return {status: 200, body: {...this.jobs.get(job.projectId, job.id), ...(job.operation === "browser-play" ? {browserSessionActive: true} : {})}};
            }
            const result = {summary: "Browser Worker stopped after its observed prefix.", detail: {rounds: lease.completed, observedPrefix: lease.prefix}};
            if (value.status === "cancelled" || this.jobs.signal(job.id)?.aborted) this.jobs.cancelled(job.id, result, recovery);
            else this.jobs.fail(job.id, typeof value.error === "string" ? value.error : "Browser Worker failed.", recovery, result);
            return {status: 200, body: this.jobs.get(job.projectId, job.id)};
        } catch (error) {
            this.jobs.fail(job.id, error instanceof Error ? error.message : String(error), recovery);
            throw error;
        } finally {
            this.release(lease);
        }
    }

    private async recoverPublication(job: StudioJobView, value: Record<string, unknown>, context: StudioContext, isCurrent: () => boolean): Promise<Reply> {
        // Historical results remain readable under their admitted binding. That binding
        // does not authorize a live session in a replacement Project or artifact.
        const historical = () => ({status: 200, body: {...this.jobs.get(job.projectId, job.id), browserSessionActive: false}});
        if (job.operation !== "browser-play" || value.cleanup !== true || !isCurrent()) return historical();
        let artifact: PokieWasmBrowserArtifact;
        try {
            artifact = await this.artifact(context);
        } catch {
            return historical();
        }
        if (!this.accepting || !isCurrent() || artifact.generation !== job.request.browserGeneration || artifact.manifest.artifact!.sha256 !== job.request.artifactIdentity) return historical();
        if (this.jobs.list(job.projectId).some(other => other.operation === "browser-play" && other.request.browserGeneration === job.request.browserGeneration && (other.request.browserAdmission as number) > (job.request.browserAdmission as number))) return historical();
        const existing = this.sessions.get(job.request.sessionId as string ?? job.id);
        if (existing && (existing.cancelled || existing.owner !== value.owner || existing.context !== context || existing.artifact.generation !== artifact.generation || existing.artifact.manifest.artifact!.sha256 !== artifact.manifest.artifact!.sha256)) return historical();
        let retained = this.jobs.get(job.projectId, job.id)!;
        if (!retained.result?.detail?.session && retained.status === "recovery-required" && record(value.output) && (value.status === "completed" || value.status === "failed" && value.output.committedProgress === true)) {
            // The lease expired before finish arrived. The same owner still holds the
            // advanced Worker and its accepted output, including non-serializable state.
            // Retain it once; never turn the cleanup-unconfirmed terminal into success.
            const lease: Lease = {job: retained, owner: value.owner as string, artifact, context, timer: undefined!, completed: 0, settle: () => undefined, drained: Promise.resolve()};
            retained = this.jobs.retainBrowserPlayPublication(job.id, this.result(lease, value.output))!;
        }
        if (!retained.result?.detail?.session || !["completed", "failed", "recovery-required"].includes(retained.status)) return historical();
        this.attachSession(retained, value.owner as string, artifact, context);
        return {status: 200, body: {...retained, browserSessionActive: true}};
    }

    private attachSession(job: StudioJobView, owner: string, artifact: PokieWasmBrowserArtifact, context: StudioContext): void {
        const id = job.request.sessionId as string ?? job.id;
        const existing = this.sessions.get(id);
        if (existing) {
            this.armSession(existing);
            return;
        }
        let settle!: () => void;
        const drained = new Promise<void>(resolve => {
            settle = resolve;
        });
        const session: SessionLease = {id, owner, artifact, context, cancelled: false, timer: undefined!, settle, drained};
        this.sessions.set(id, session);
        this.armSession(session);
    }

    private result(lease: Lease, output: unknown): StudioJobResultView {
        const {job, artifact} = lease;
        const manifest = artifact.manifest;
        const game = {id: manifest.component.id, name: manifest.component.id, version: manifest.component.version};
        const provenance = {projectRoot: artifact.projectRoot, artifactIdentity: manifest.artifact!.sha256, configHash: manifest.artifact!.configurationHash, execution: "browser-worker"};
        if (job.operation === "simulation") {
            if (!Array.isArray(output) || !output.length || output.some(item => !record(item) || !record(item.statistics) || item.statistics.rounds !== job.request.rounds)) throw new Error("Incomplete WASM Worker simulation result.");
            const results = output as {mode?: string; targetRtp?: number; statistics: SimulationStatistics}[];
            const reports = results.map(item => new SimulationReportBuilder().build({manifest: game, requestedRounds: job.request.rounds as number, seed: job.request.seed as string, statistics: item.statistics, durationMs: Date.now() - job.createdAt, packageRoot: artifact.projectRoot, configHash: provenance.configHash, workers: 1, workerSeedStrategy: "portable seeded host stream (browser Worker)", betMode: item.mode, targetRtp: item.targetRtp}));
            const report = job.request.modeName === "all" ? {game, requestedRounds: job.request.rounds, seed: job.request.seed, workers: 1, modes: Object.fromEntries(results.map((item, index) => [item.mode!, reports[index]]))} : reports[0];
            this.jobs.progress(job.id, {stage: "Completed browser Worker", unit: "accepted plays", current: results.reduce((sum, item) => sum + item.statistics.rounds, 0), total: results.reduce((sum, item) => sum + item.statistics.rounds, 0)});
            return {summary: "Browser Worker simulation completed.", provenance, outputs: [{label: "Simulation report", downloadPath: `/api/project/reports/${job.id}/download?format=json`}], detail: {report, statistics: results[0].statistics}};
        }
        if (!record(output)) throw new Error("Malformed WASM Worker result.");
        if (job.operation === "replay") {
            const observed = output as PokieWasmReplayObservation;
            if (!observed.stateAfter || !observed.finalRound) throw new Error("Incomplete WASM Worker replay result.");
            const round = observed.finalRound;
            const serialize = manifest.capabilities.includes("runtime.serialize");
            const descriptor = {...round.network, sessionId: job.id, game, seed: job.request.seed, round: job.request.round, totalBet: observed.totalBet, totalWin: observed.totalWin, totalPayout: observed.totalPayout,
                credits: round.credits, screen: round.screen, ...(job.request.unit ? {unit: job.request.unit} : {}), ...(job.request.entryCommands ? {commands: job.request.entryCommands} : {}),
                ...(job.request.modeName ? {modePolicy: {betModeId: job.request.modeName, selection: "repeat-when-available"}} : {}),
                ...(manifest.capabilities.includes("artifact.inspect") ? {artifact: projectPokieWasmRoundArtifact(round, {game, pokieVersion: POKIE_WASM_RUNTIME_VERSION, configHash: provenance.configHash}, `wasm:replay:${job.id}`)} : {}),
                ...(round.logicalRound ? {logicalRound: round.logicalRound} : {}), timestamp: job.createdAt, durationMs: Date.now() - job.createdAt,
                ...(serialize ? {stateBefore: observed.stateBefore, stateAfter: observed.stateAfter} : {}), wasm: provenance};
            if (job.request.simulationId) this.recorder.record({sessionId: job.id, game, credits: round.credits, bet: round.stake, win: round.win ?? round.payout, screen: round.screen.map(reel => [...reel]), debug: {artifact: descriptor.artifact, stateBefore: descriptor.stateBefore, stateAfter: descriptor.stateAfter}}, {source: "simulation-sample", operation: "simulation-sample", projectRoot: artifact.projectRoot, seed: job.request.seed as string, modeName: job.request.modeName as string | undefined});
            this.jobs.progress(job.id, {stage: "Completed browser Worker", unit: "rounds", current: job.request.round as number, total: job.request.round as number});
            return {summary: "Browser Worker replay completed.", provenance, outputs: [{label: "Replay", downloadPath: `/api/project/replays/${job.id}/download`}], detail: {descriptor}};
        }
        const round = (output.round ?? (job.request.action === "restore" ? output.restoredRound : undefined)) as PokieWasmRound | undefined;
        const sessionId = job.request.sessionId as string ?? job.id;
        let roundDetail: StudioRuntimeSessionView["debug"] = {};
        if (round) roundDetail = manifest.capabilities.includes("artifact.inspect")
            ? {artifact: projectPokieWasmRoundArtifact(round, {game, pokieVersion: POKIE_WASM_RUNTIME_VERSION, configHash: provenance.configHash}, `wasm:${job.id}`)}
            : {artifactUnavailableReason: "This artifact does not declare artifact.inspect."};
        const session: StudioRuntimeSessionView = {...(record(output.initialData) ? output.initialData : {}), ...round?.network,
            sessionId, game, credits: round?.credits ?? (output.state as {credits?: number})?.credits ?? 1000, ...(round ? {bet: round.network?.bet ?? round.stake, stake: round.stake, win: round.win ?? round.payout, payout: round.payout, screen: round.screen.map(reel => [...reel]),
                ...(round.logicalRound ? {logicalRound: projectLogicalRound(round.logicalRound), logicalRoundDurability: "process-only" as const} : {}), sequenceSelections: round.sequenceSelections, sequenceStatistics: round.sequenceStatistics} : {}),
            logicalRoundDeliverySupported: manifest.serialization.state === "pokie.state.v4",
            scenarioCapabilities: {findAnyWin: "WASM browser sessions support direct Spin; use a bounded simulation to explore wins.", findSymbolWin: "WASM browser sessions support direct Spin; use a bounded simulation to explore wins.", findFreeGames: "WASM browser sessions support direct Spin; use a bounded simulation to explore features."},
            debug: {...(manifest.capabilities.includes("runtime.serialize") ? {stateBefore: output.stateBefore, stateAfter: output.stateAfter ?? output.state} : {}),
                ...roundDetail}, wasm: provenance};
        if (output.round && round) {
            session.studioRequestId = (job.request.command as Record<string, unknown>)?.requestId as string | undefined;
            this.recorder.record(session, {source: "play", operation: "spin", projectRoot: artifact.projectRoot, seed: job.request.seed as string});
        }
        return {summary: output.committedProgress === true ? "Browser Worker Play retained its committed prefix." : "Browser Worker Play completed.", provenance, detail: {session}};
    }

    private armSession(session: SessionLease): void {
        clearTimeout(session.timer);
        session.timer = setTimeout(() => {
            if (this.sessions.get(session.id) !== session) return;
            clearTimeout(session.timer);
            this.lostSessionCleanup = true;
            try {
                this.jobs.recordCleanupFailure({projectId: canonicalStudioProjectIdentity(session.artifact.projectRoot), operation: "browser-worker-cleanup", request: {sessionId: session.id, artifactIdentity: session.artifact.manifest.artifact!.sha256}, conflictKey: `browser-worker-cleanup:${session.id}`}, {action: "new-session", reason: "Idle browser Worker owner stopped responding. Close that tab, reopen Studio and explicitly start a new session."});
            } catch {
                // shutdown still fails closed when durable storage is unavailable.
            } finally {
                this.sessions.delete(session.id);
                session.settle();
            }
        }, this.leaseMs);
    }
    private arm(lease: Lease): void {
        clearTimeout(lease.timer);
        lease.timer = setTimeout(() => {
            if (!isStudioJobTerminal(this.jobs.get(lease.job.projectId, lease.job.id)!.status)) {
                this.jobs.requireRecovery(lease.job.id, {...recovery, reason: "Browser Worker owner stopped responding; cleanup could not be confirmed. Retry after closing the disconnected tab."}, {summary: "Interrupted browser execution.", detail: {rounds: lease.completed, observedPrefix: lease.prefix}});
                this.jobs.setRecovery(lease.job.id, recovery);
            }
            this.release(lease);
        }, this.leaseMs);
    }
    private release(lease: Lease): void {
        clearTimeout(lease.timer);
        this.leases.delete(lease.job.id);
        lease.settle();
    }
}
function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

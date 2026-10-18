import {
    createBlueprintWasmArtifact,
    GameBlueprintValidator,
    PokieWasmWorkerClient,
    POKIE_WASM_RUNTIME_VERSION,
    POKIE_WASM_SIMULATION_CREDITS,
    type PokieWasmWorkerPort,
} from "../../src/wasm/browser.js";
import {browserModelHash} from "../../src/optimization/BrowserBlueprintOptimization.js";
import {validateOptimizationRequest} from "../../src/optimization/validateOptimizationRequest.js";
import {assertOnlyTuned} from "../../src/optimization/internal/optimizationModel.js";
import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";

export type DraftSettings = {seed: string; bet: number; mode?: string; rounds: number};
export type PlaygroundDraft = {blueprint: GameBlueprint; settings: DraftSettings};
export type PlaygroundEvent = {status: string; message: string; progress?: {completed: number; total?: number}};
export const PLAYGROUND_LIMITS = {inputBytes: 65536, rounds: 8192, replay: 1024, deadlineMs: 20000, idleMs: 5000, outputBytes: 2000000, cells: 48, lineCells: 192, payoutEntries: 1568, resultPositions: 5376};
export type PlaygroundArtifact = Awaited<ReturnType<typeof createBlueprintWasmArtifact>>;
type Command = Parameters<PokieWasmWorkerClient["request"]>[0];

export function validatePlaygroundDraft(value: PlaygroundDraft): void {
    if (new TextEncoder().encode(JSON.stringify(value)).length > PLAYGROUND_LIMITS.inputBytes) throw new Error("Input exceeds the 64 KiB playground limit.");
    // Check numeric expansion before validation/lowering can construct default lines,
    // payout tables or screen/result buffers. Input byte size alone does not bound them.
    const b = value.blueprint;
    const geometry = b?.screenGeometry;
    const generatedReels = geometry?.generated?.reels ?? b?.reels;
    const generatedRows = geometry?.generated?.rows ?? b?.rows;
    const evaluatedRows = geometry?.evaluated?.rows ?? b?.rows;
    const visibleRows = geometry
        ? Math.ceil(geometry.visible?.rowOffset + geometry.visible?.rows) - Math.floor(geometry.visible?.rowOffset)
        : b?.rows;
    const boundedInteger = (n: number, max: number): boolean => Number.isSafeInteger(n) && n >= 1 && n <= max;
    const cells = b?.reels * evaluatedRows;
    const symbols = b?.symbols?.length ?? 0;
    const lines = b?.paylines?.length ?? evaluatedRows;
    if (
        !boundedInteger(b?.reels, 6) || !boundedInteger(b?.rows, 8) ||
        !boundedInteger(generatedReels, 6) || !boundedInteger(generatedRows, 8) ||
        !boundedInteger(evaluatedRows, 8) || !boundedInteger(visibleRows, 8) ||
        generatedReels * generatedRows > PLAYGROUND_LIMITS.cells ||
        cells > PLAYGROUND_LIMITS.cells || lines * b.reels > PLAYGROUND_LIMITS.lineCells ||
        symbols * (cells + 1) > PLAYGROUND_LIMITS.payoutEntries ||
        (lines + symbols + cells) * cells > PLAYGROUND_LIMITS.resultPositions
    ) throw new Error("Playground preparation limit: at most 6×8 generated/evaluated/visible cells with bounded line, payout and result allocations.");
    const issues = new GameBlueprintValidator().validate(value.blueprint).filter((i) => i.severity === "error");
    if (issues.length) throw new Error(`Structurally invalid: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    const s = value.settings;
    if (
        b.reels > 6 ||
        b.rows > 8 ||
        b.symbols.length > 32 ||
        (b.paylines?.length ?? 0) > 32 ||
        b.reelStrips?.some((r) => r.length > 256) ||
        b.reelStripGeneration ||
        b.symbolWeights
    ) throw new Error(
        "Unsupported playground size or unresolved reels: use at most 6×8, 32 symbols/lines and literal strips of at most 256 stops.",
    );
    if (
        !s.seed.trim() ||
        s.seed.length > 256 ||
        !Number.isFinite(s.bet) ||
        s.bet <= 0 ||
        !(b.availableBets ?? []).includes(s.bet) ||
        !Number.isSafeInteger(s.rounds) ||
        s.rounds < 1 ||
        s.rounds > PLAYGROUND_LIMITS.rounds
    ) throw new Error("Supply an explicit seed, an authored positive denomination and 1–8192 accepted steps.");
    const modes = b.betModes?.map((m) => m.id) ?? [];
    if (
        modes.length > 8 ||
        (s.mode === "all" && s.rounds * modes.length > PLAYGROUND_LIMITS.rounds) ||
        b.reelSequences?.some((r) =>
            r.type === "exact" ? r.symbols.length > 256 : r.variants.length > 8 || r.variants.some((v) => v.symbols.length > 256),
        )
    ) throw new Error("Playground limits: eight modes/variants, 256 stops and 8192 total accepted simulation steps across modes.");
    if (s.mode && (s.mode === "all" ? !modes.length : !modes.includes(s.mode))) throw new Error("Unsupported mode for this model.");
}

/** One generation owns at most one short-lived Worker. No job or candidate survives editing/reload. */
export class PlaygroundController {
    private generation = 0;
    private client?: PokieWasmWorkerClient;
    private timer?: ReturnType<typeof setTimeout>;
    private preview?: {source: string; candidate: GameBlueprint; revision: string; requestRevision: string};
    private readonly createWorker: () => PokieWasmWorkerPort;
    private readonly emit: (event: PlaygroundEvent) => void;
    private readonly limits: typeof PLAYGROUND_LIMITS;
    public constructor(createWorker: () => PokieWasmWorkerPort, emit: (event: PlaygroundEvent) => void, limits = PLAYGROUND_LIMITS) {
        this.createWorker = createWorker;
        this.emit = emit;
        this.limits = limits;
    }
    public invalidate(message = "Interrupted/reset: inputs changed; prior output is stale."): void {
        this.generation++;
        this.release(message);
        this.preview = undefined;
        this.emit({status: "interrupted", message});
    }
    public cancel(): void {
        this.invalidate("Cancelled: owned Worker terminated; no partial result is complete.");
        this.emit({status: "cancelled", message: "Cancelled. Start any action to run again."});
    }
    public dispose(): void {
        this.invalidate("Interrupted/reset: page released all owned work.");
    }
    public diagnostics() {
        return {workers: this.client ? 1 : 0, timers: this.timer ? 1 : 0, pending: this.client?.getDiagnostics().pending ?? 0};
    }
    public async prepare(draft: PlaygroundDraft) {
        const generation = this.generation;
        this.emit({status: "validating", message: "Checking structure and executable support…"});
        validatePlaygroundDraft(draft);
        const detached = JSON.parse(JSON.stringify(draft)) as PlaygroundDraft;
        const artifact = await createBlueprintWasmArtifact(detached.blueprint);
        const revision = await browserModelHash(detached);
        if (generation !== this.generation) throw new Error("Interrupted: input changed during validation.");
        return {draft: detached, artifact, revision};
    }
    public async run(draft: PlaygroundDraft, action: string, extra?: unknown) {
        this.invalidate("Interrupted/reset: starting a replacement operation.");
        const generation = this.generation;
        try {
            const request = action === "optimize" ? validateOptimizationRequest(extra) : undefined;
            const prepared = await this.prepare(draft);
            if (generation !== this.generation) throw new Error("Interrupted before Worker creation.");
            const {settings, blueprint} = prepared.draft;
            this.emit({status: "running", message: `${action}: initializing local WASM Worker…`});
            const client = new PokieWasmWorkerClient(
                this.createWorker,
                {
                    project: blueprint.manifest.id,
                    generation: String(generation),
                    artifact: prepared.artifact.manifest.artifact!.sha256,
                    job: `${action}:${generation}`,
                },
                this.limits.idleMs,
            );
            this.client = client;
            this.timer = setTimeout(
                () => client.dispose("Deadline exceeded: owned work terminated. No completed result."),
                this.limits.deadlineMs,
            );
            await client.request({
                type: "instantiate",
                ...prepared.artifact,
                seed: settings.seed,
                credits: POKIE_WASM_SIMULATION_CREDITS,
                traceCapacity: 32,
            });
            let command: Command;
            let replay: object | undefined;
            if (action === "play") {
                const view = await client.request({type: "serialize"});
                const entry = {
                    bet: settings.bet,
                    ...(settings.mode ? {mode: settings.mode} : {}),
                    ...(prepared.artifact.manifest.serialization.state === "pokie.state.v4"
                        ? {kind: "spin", delivery: "stepwise", roundId: "portable:0"}
                        : {}),
                };
                if (settings.mode === "all") throw new Error("Play requires one mode; select a declared mode or default.");
                command = {type: "play", command: entry};
                replay = {state: view, commands: [entry]};
            } else if (action === "sim" || action === "report") command = {type: "simulate", rounds: settings.rounds, seed: settings.seed, bet: settings.bet, mode: settings.mode};
            else if (action === "replay") {
                if (settings.rounds > this.limits.replay) throw new Error("Replay is bounded to 1024 accepted steps.");
                if (settings.mode === "all") throw new Error("Select one mode for replay; all-mode samples stay independent.");
                command = {
                    type: "replay-target",
                    options: {
                        seed: settings.seed,
                        round: settings.rounds,
                        unit: "step",
                        initialCredits: POKIE_WASM_SIMULATION_CREDITS,
                        modeName: settings.mode,
                        entryCommands: Array.from({length: settings.rounds}, () => ({kind: "spin", bet: settings.bet})),
                    },
                };
            } else if (action === "replay-play") command = {type: "replay", ...(extra as {state: never; commands: Record<string, unknown>[]})};
            else if (action === "optimize") command = {type: "optimize", request, blueprint};
            else command = {type: "view"};
            const start = performance.now();
            const result = await client.request(command, (progress) => {
                if (generation === this.generation) this.emit({
                    status: "running",
                    message: `${action}: ${progress.completed} / ${progress.total ?? "?"} observed`,
                    progress,
                });
            });
            if (generation !== this.generation) throw new Error("Interrupted: stale response discarded.");
            if (JSON.stringify(result).length > this.limits.outputBytes) throw new Error("Output exceeds bounded retention; reduce requested work.");
            if (action === "optimize") {
                const candidate = result as {
                    sourceRevision?: string;
                    candidate?: GameBlueprint;
                    candidateRevision?: string;
                    requestRevision?: string;
                };
                if (candidate.candidate) {
                    if (
                        candidate.sourceRevision !== (await browserModelHash(blueprint)) ||
                        candidate.requestRevision !== (await browserModelHash(request)) ||
                        candidate.candidateRevision !== (await browserModelHash(candidate.candidate))
                    ) throw new Error("Candidate identity mismatch.");
                    assertOnlyTuned(blueprint, candidate.candidate, request!.policy);
                    if (generation !== this.generation) throw new Error("Interrupted: stale optimization candidate discarded.");
                    this.preview = {
                        source: prepared.revision,
                        candidate: structuredClone(candidate.candidate),
                        revision: candidate.candidateRevision!,
                        requestRevision: candidate.requestRevision!,
                    };
                }
            }
            if (generation !== this.generation) throw new Error("Interrupted: stale result discarded.");
            this.emit({
                status: "completed",
                message: `${action} completed. ${
                    action === "optimize"
                        ? "Preview only; review evidence before applying."
                        : "Observed results belong to the displayed identity."
                }`,
            });
            return {...prepared, action, result, replay, durationMs: performance.now() - start, runtimeVersion: POKIE_WASM_RUNTIME_VERSION};
        } catch (error) {
            if (generation === this.generation) this.emit({status: "failed", message: error instanceof Error ? error.message : String(error)});
            throw error;
        } finally {
            if (generation === this.generation) this.release("Operation complete; runtime released.");
        }
    }
    public async applyCandidate(draft: PlaygroundDraft, request: unknown, candidate: GameBlueprint): Promise<GameBlueprint> {
        const preview = this.preview;
        const submitted = structuredClone(draft);
        if (
            !preview ||
            preview.source !== (await browserModelHash(submitted)) ||
            preview.requestRevision !== (await browserModelHash(request)) ||
            preview.revision !== (await browserModelHash(candidate))
        ) throw new Error("Stale preview: model, settings, policy or candidate changed. Run optimization again.");
        if (this.preview !== preview) throw new Error("Stale preview: invalidated during apply. Run optimization again.");
        const next = structuredClone(preview.candidate);
        await this.prepare({...submitted, blueprint: next});
        if (this.preview !== preview) throw new Error("Stale preview: invalidated during apply. Run optimization again.");
        this.invalidate("Interrupted/reset: candidate explicitly applied; runtime will be recreated for the new identity.");
        return next;
    }
    private release(reason: string): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = undefined;
        this.client?.dispose(reason);
        this.client = undefined;
    }
}

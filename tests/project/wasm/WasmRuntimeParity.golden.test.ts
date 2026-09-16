import {GameSession} from "../../../src/session/GameSession.js";
import type {RandomNumberGenerating} from "../../../src/session/videoslot/combinations/RandomNumberGenerating.js";
import {SeededRandomNumberGenerator} from "../../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {SymbolsCombinationsGenerator} from "../../../src/session/videoslot/combinations/SymbolsCombinationsGenerator.js";
import {SymbolsSequence} from "../../../src/session/videoslot/combinations/SymbolsSequence.js";
import {VideoSlotConfig} from "../../../src/session/videoslot/VideoSlotConfig.js";
import {VideoSlotSession} from "../../../src/session/videoslot/VideoSlotSession.js";
import {Paytable} from "../../../src/session/videoslot/paytable/Paytable.js";
import {VideoSlotWinCalculator} from "../../../src/session/videoslot/wincalculator/VideoSlotWinCalculator.js";
import {ReplayRecorder} from "../../../src/replay/ReplayRecorder.js";
import {SeededPokieWasmHost, instantiatePokieWasm} from "../../../src/wasm/PokieWasmRuntime.js";
import type {PokieWasmRound, PokieWasmSessionState} from "../../../src/wasm/PokieWasmRuntimeApi.js";
import {PORTABLE_RUNTIME_FEATURE_GOLDEN, PORTABLE_RUNTIME_GOLDEN} from "../../fixtures/wasm/portableRuntimeGolden.js";
import {createCanonicalWasmFixture} from "../../fixtures/wasm/createCanonicalWasmFixture.js";

describe("WASM runtime parity golden", () => {
    it("runs the reviewed fixture independently through the Node session runtime and canonical WASM runtime", async () => {
        const golden = PORTABLE_RUNTIME_GOLDEN;
        const node = runNodeReference(golden.seed, golden.commands);
        const fixture = createCanonicalWasmFixture({id: golden.id});
        const wasmRuntime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(golden.seed));
        const wasmSession = wasmRuntime.createSession(golden.seed);
        const wasmRounds: PokieWasmRound[] = [];
        for (const command of golden.commands) wasmRounds.push(await wasmSession.play(command));
        const wasmState = wasmSession.serialize();

        const freshRuntime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(golden.seed));
        const continuation = await freshRuntime.restoreSession(wasmState).play(golden.continuationCommand);
        const replayRuntime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(golden.seed));
        const replay = await replayRuntime.replay(wasmState, [golden.continuationCommand]);
        const nodeContinuation = resumeNodeReference(golden.seed, node.state, golden.continuationCommand);
        const nodeReplay = recordNodeReplay(golden.seed, golden.replayRound);
        const wasmReplay = {
            round: replay[0].sequence,
            totalBet: [...wasmRounds, ...replay].reduce((total, round) => total + round.stake, 0),
            totalWin: [...wasmRounds, ...replay].reduce((total, round) => total + round.payout, 0),
            screen: replay[0].screen,
        };

        const observed = {
            draws: node.state.draws,
            rounds: node.rounds,
            state: node.state,
            continuation: nodeContinuation,
            replay: nodeReplay,
        };
        // This checked-in record is the review authority. The Node reference is
        // evaluated before the WASM runtime and never consumes WASM-produced draws.
        expect(observed).toEqual(golden.expected);
        expect({draws: wasmState.draws, rounds: wasmRounds.map(canonicalRound), state: wasmState, continuation: canonicalRound(continuation)}).toEqual({
            draws: golden.expected.draws,
            rounds: golden.expected.rounds,
            state: golden.expected.state,
            continuation: golden.expected.continuation,
        });
        expect(replay.map(canonicalRound)).toEqual([golden.expected.continuation]);
        expect({
            round: replay[0].sequence,
            totalBet: [...wasmRounds, ...replay].reduce((total, round) => total + round.stake, 0),
            totalWin: [...wasmRounds, ...replay].reduce((total, round) => total + round.payout, 0),
            screen: replay[0].screen,
        }).toEqual(golden.expected.replay);
        expect(nodeContinuation).toEqual(golden.expected.continuation);
        expect(nodeReplay).toEqual(golden.expected.replay);
        expect(wasmReplay).toEqual(golden.expected.replay);

        wasmRuntime.dispose();
        freshRuntime.dispose();
        replayRuntime.dispose();
    });

    it("maps each production host draw directly to its non-power-of-two reel stop", async () => {
        const fixture = createCanonicalWasmFixture({id: "golden-rejection", stripLengths: [3]});
        const maximumHostWord = 0x7fffffff;
        const draws = [1 - 0.25 / maximumHostWord, 1 / maximumHostWord, 0];
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom: () => draws.shift()!});
        const session = runtime.createSession("rejection");
        await expect(session.play()).resolves.toMatchObject({stops: [2]});
        const state = session.serialize();
        expect(state).toMatchObject({sequence: 1, draws: [expect.any(Number)]});
        expect(() => runtime.restoreSession(state)).not.toThrow();
        runtime.dispose();
    });

    it("runs the independently reviewed wild/scatter feature fixture through Node and WASM parity paths", async () => {
        const golden = PORTABLE_RUNTIME_FEATURE_GOLDEN;
        const node = runNodeReference(golden.seed, golden.commands, golden.fixture);
        const fixture = createCanonicalWasmFixture({id: golden.id, ...golden.fixture});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(golden.seed));
        const session = runtime.createSession(golden.seed);
        const rounds: PokieWasmRound[] = [];
        for (const command of golden.commands) rounds.push(await session.play(command));
        const state = session.serialize();
        const continuedRuntime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(golden.seed));
        const continuation = await continuedRuntime.restoreSession(state).play(golden.continuationCommand);
        const replayRuntime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(golden.seed));
        const replay = await replayRuntime.replay(state, [golden.continuationCommand]);
        const nodeContinuation = resumeNodeReference(golden.seed, node.state, golden.continuationCommand, golden.fixture);
        const nodeReplay = recordNodeReplay(golden.seed, golden.replayRound, golden.fixture);
        const observed = {
            draws: node.state.draws,
            rounds: node.rounds,
            state: node.state,
            continuation: nodeContinuation,
            replay: nodeReplay,
        };
        expect(observed).toEqual(golden.expected);
        expect({draws: state.draws, rounds: rounds.map(canonicalRound), state, continuation: canonicalRound(continuation)}).toEqual({
            draws: golden.expected.draws,
            rounds: golden.expected.rounds,
            state: golden.expected.state,
            continuation: golden.expected.continuation,
        });
        expect(replay.map(canonicalRound)).toEqual([golden.expected.continuation]);
        expect({
            round: replay[0].sequence,
            totalBet: [...rounds, ...replay].reduce((total, round) => total + round.stake, 0),
            totalWin: [...rounds, ...replay].reduce((total, round) => total + round.payout, 0),
            screen: replay[0].screen,
        }).toEqual(golden.expected.replay);
        runtime.dispose();
        continuedRuntime.dispose();
        replayRuntime.dispose();
    });

    it("rejects malformed portable state and reports canonical runtime traps", async () => {
        const fixture = createCanonicalWasmFixture({id: "golden-invalid"});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("invalid"));
        expect(() => runtime.restoreSession({schemaVersion: "pokie.state.v1", seed: "x", draws: [1], sequence: 1, credits: 1000})).toThrow(/malformed/);
        expect(() => runtime.restoreSession({schemaVersion: "pokie.state.v1", seed: "x", draws: [], sequence: -1, credits: 1000})).toThrow(/malformed/);
        runtime.dispose();

        const trappingFixture = createCanonicalWasmFixture({id: "golden-trap", trapping: true});
        const trappingRuntime = await instantiatePokieWasm(trappingFixture.bytes, trappingFixture.manifest, new SeededPokieWasmHost("trap"));
        await expect(trappingRuntime.createSession("trap").play()).rejects.toThrow(/unreachable|trap/i);
        trappingRuntime.dispose();
    });
});

type FeatureFixture = {
    readonly reelStrips: readonly (readonly string[])[];
    readonly wilds: readonly string[];
    readonly scatters: readonly string[];
    readonly paytable: Readonly<Record<string, Readonly<Record<number, number>>>>;
};

const BASE_FIXTURE: FeatureFixture = {
    reelStrips: [["A", "B"], ["A", "B"]], wilds: [], scatters: [], paytable: {A: {2: 2}, B: {2: 1}},
};

type NodeReference = {readonly session: VideoSlotSession<string>; readonly random: ProductionSeededRandomCapture; readonly generator: SymbolsCombinationsGenerator<string>};

/** Observes the real seeded RNG without changing its range-selection semantics. */
class ProductionSeededRandomCapture implements RandomNumberGenerating {
    public readonly draws: number[] = [];
    private readonly random: SeededRandomNumberGenerator;
    private readonly capture: SeededRandomNumberGenerator;

    public constructor(seed: string) {
        this.random = new SeededRandomNumberGenerator(seed);
        this.capture = new SeededRandomNumberGenerator(seed);
    }

    public getRandomInt(minimum: number, maximum: number): number {
        this.draws.push(this.capture.getRandomInt(0, 0x100000000) / 0x100000000);
        return this.random.getRandomInt(minimum, maximum);
    }

    public toSessionState(): number {
        return this.random.toSessionState();
    }

    public fromSessionState(state: number): this {
        this.random.fromSessionState(state);
        this.capture.fromSessionState(state);
        return this;
    }

    public resetCapture(): void {
        this.draws.splice(0);
    }
}

function createNodeReference(seed: string, state?: PokieWasmSessionState, fixture: FeatureFixture = BASE_FIXTURE): NodeReference {
    const config = new VideoSlotConfig<string>();
    config.setReelsNumber(fixture.reelStrips.length);
    config.setReelsSymbolsNumber(1);
    config.setAvailableSymbols([...new Set(fixture.reelStrips.flat())]);
    config.setWildSymbols([...fixture.wilds]);
    config.setScatterSymbols([...fixture.scatters]);
    config.setAvailableBets([1]);
    config.setSymbolsSequences(fixture.reelStrips.map((strip) => new SymbolsSequence<string>().fromArray([...strip])));
    const symbols = [...new Set(fixture.reelStrips.flat())];
    const paytable = new Paytable<string>([1], symbols, [...fixture.wilds, ...fixture.scatters], fixture.reelStrips.length);
    for (const [symbol, payouts] of Object.entries(fixture.paytable)) {
        for (const [count, payout] of Object.entries(payouts)) paytable.setPayoutForSymbol(symbol, Number(count), payout);
    }
    config.setPaytable(paytable);
    const random = new ProductionSeededRandomCapture(seed);
    const generator = new SymbolsCombinationsGenerator(config, random);
    const session = new VideoSlotSession(config, generator, new VideoSlotWinCalculator(config), new GameSession(config));
    // VideoSlotSession prepares an initial screen in its constructor. A canonical
    // runtime starts at the first playable round, so rewind the genuine Node
    // session's injected RNG before the public game/session path begins.
    session.fromSessionState({rngState: new SeededRandomNumberGenerator(seed).toSessionState()});
    random.resetCapture();
    if (state !== undefined) {
        session.fromSessionState({rngState: state.rngState});
        random.draws.push(...state.draws);
        session.setCreditsAmount(state.credits);
    }
    return {session, random, generator};
}

function runNodeReference(seed: string, commands: readonly Record<string, unknown>[], fixture: FeatureFixture = BASE_FIXTURE) {
    const reference = createNodeReference(seed, undefined, fixture);
    const rounds = commands.map((command, index) => playNodeReference(reference, command, index + 1));
    const state: PokieWasmSessionState = {schemaVersion: "pokie.state.v1", seed, draws: [...reference.random.draws], sequence: rounds.length, credits: reference.session.getCreditsAmount(), rngState: reference.session.toSessionState().rngState as number};
    return {rounds, state};
}

function resumeNodeReference(seed: string, state: PokieWasmSessionState, command: Record<string, unknown>, fixture: FeatureFixture = BASE_FIXTURE) {
    return playNodeReference(createNodeReference(seed, state, fixture), command, state.sequence + 1);
}

function playNodeReference(reference: NodeReference, command: Record<string, unknown>, sequence: number) {
    const before = reference.random.draws.length;
    const creditsBefore = reference.session.getCreditsAmount();
    reference.session.setBet(command.bet as number);
    reference.session.play();
    const roundDraws = reference.random.draws.slice(before);
    const screen = reference.session.getSymbolsCombination().toMatrix();
    const payout = reference.session.getWinAmount();
    return canonicalRound({sequence, draw: roundDraws[0], stops: reference.generator.getLastStopPositions(), screen, winMultiplier: payout, stake: reference.session.getBet(), payout, creditsBefore, credits: reference.session.getCreditsAmount(), command});
}

function recordNodeReplay(seed: string, round: number, fixture: FeatureFixture = BASE_FIXTURE) {
    const game = {
        getManifest: () => ({id: PORTABLE_RUNTIME_GOLDEN.id, name: "Portable Runtime Golden", version: "1.0.0"}),
        createSession: (context?: {seed?: string}) => createNodeReference(context?.seed ?? seed, undefined, fixture).session,
    };
    const replay = new ReplayRecorder().record({game, seed, round});
    return {round: replay.round, totalBet: replay.totalBet, totalWin: replay.totalWin, screen: replay.screen};
}

function canonicalRound(round: Pick<PokieWasmRound, "sequence" | "draw" | "stops" | "screen" | "winMultiplier" | "stake" | "payout" | "creditsBefore" | "credits" | "command">) {
    return {sequence: round.sequence, draw: round.draw, stops: round.stops, screen: round.screen, winMultiplier: round.winMultiplier, stake: round.stake, payout: round.payout, creditsBefore: round.creditsBefore, credits: round.credits, command: round.command};
}

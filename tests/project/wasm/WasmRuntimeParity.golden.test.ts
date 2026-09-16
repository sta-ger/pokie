import {SymbolsCombinationsGenerator} from "../../../src/session/videoslot/combinations/SymbolsCombinationsGenerator.js";
import {SymbolsSequence} from "../../../src/session/videoslot/combinations/SymbolsSequence.js";
import {VideoSlotConfig} from "../../../src/session/videoslot/VideoSlotConfig.js";
import {Paytable} from "../../../src/session/videoslot/paytable/Paytable.js";
import {LineWinCalculator} from "../../../src/session/videoslot/wincalculator/LineWinCalculator.js";
import {SeededPokieWasmHost, instantiatePokieWasm} from "../../../src/wasm/PokieWasmRuntime.js";
import type {PokieWasmRound} from "../../../src/wasm/PokieWasmRuntimeApi.js";
import {createCanonicalWasmFixture} from "../../fixtures/wasm/createCanonicalWasmFixture.js";

const SEED = "wasm-parity-golden";
const COMMANDS = [{bet: 1}, {bet: 1}, {bet: 1}];

describe("WASM runtime parity golden", () => {
    it("matches the existing Node combinations and win runtime, then restores and replays from serialized host state", async () => {
        const fixture = createCanonicalWasmFixture({id: "golden"});
        const wasmRuntime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(SEED));
        const wasmSession = wasmRuntime.createSession(SEED);
        const wasmRounds: PokieWasmRound[] = [];
        for (const command of COMMANDS) wasmRounds.push(await wasmSession.play(command));
        const state = wasmSession.serialize();
        expect(canonicalRounds(wasmRounds)).toEqual(createNodeGoldenRounds(state.draws, COMMANDS));
        expect(state).toMatchObject({schemaVersion: "pokie.state.v1", seed: SEED, sequence: 3, rngState: expect.any(Number)});

        const freshRuntime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(SEED));
        const resumed = freshRuntime.restoreSession(state);
        const resumedRound = await resumed.play({bet: 1});
        const replayRuntime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(SEED));
        expect(await replayRuntime.replay(state, [{bet: 1}])).toEqual([resumedRound]);
        expect(resumed.serialize().draws).toHaveLength(state.draws.length + 2);
        wasmRuntime.dispose();
        freshRuntime.dispose();
        replayRuntime.dispose();
    });

    it("preserves a runtime-produced multi-draw rejection-sampling state", async () => {
        const fixture = createCanonicalWasmFixture({id: "golden-rejection", stripLengths: [3]});
        const maximumHostWord = 0x7fffffff;
        const draws = [1 - 0.25 / maximumHostWord, 1 / maximumHostWord, 0];
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, {nextRandom: () => draws.shift()!});
        const session = runtime.createSession("rejection");
        await expect(session.play()).resolves.toMatchObject({stops: [1]});
        const state = session.serialize();
        expect(state).toMatchObject({sequence: 1, draws: [expect.any(Number), expect.any(Number)]});
        expect(() => runtime.restoreSession(state)).not.toThrow();
        runtime.dispose();
    });

    it("rejects malformed portable state and reports canonical runtime traps", async () => {
        const fixture = createCanonicalWasmFixture({id: "golden-invalid"});
        const runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("invalid"));
        expect(() => runtime.restoreSession({schemaVersion: "pokie.state.v1", seed: "x", draws: [1], sequence: 1})).toThrow(/malformed/);
        expect(() => runtime.restoreSession({schemaVersion: "pokie.state.v1", seed: "x", draws: [], sequence: -1})).toThrow(/malformed/);
        runtime.dispose();

        const trappingFixture = createCanonicalWasmFixture({id: "golden-trap", trapping: true});
        const trappingRuntime = await instantiatePokieWasm(trappingFixture.bytes, trappingFixture.manifest, new SeededPokieWasmHost("trap"));
        await expect(trappingRuntime.createSession("trap").play()).rejects.toThrow(/unreachable|trap/i);
        trappingRuntime.dispose();
    });
});

function createNodeGoldenRounds(draws: readonly number[], commands: readonly Record<string, unknown>[]): readonly ReturnType<typeof canonicalRound>[] {
    const config = new VideoSlotConfig<string>();
    config.setReelsNumber(2);
    config.setReelsSymbolsNumber(1);
    config.setAvailableSymbols(["A", "B"]);
    config.setWildSymbols([]);
    config.setScatterSymbols([]);
    config.setAvailableBets([1]);
    config.setSymbolsSequences([new SymbolsSequence<string>().fromArray(["A", "B"]), new SymbolsSequence<string>().fromArray(["A", "B"])]);
    const paytable = new Paytable<string>([1], ["A", "B"], [], 2);
    paytable.setPayoutForSymbol("A", 2, 2);
    paytable.setPayoutForSymbol("B", 2, 1);
    config.setPaytable(paytable);
    const values = [...draws];
    const combinations = new SymbolsCombinationsGenerator(config, {getRandomInt: (_minimum, maximum) => Math.floor(values.shift()! * 0x80000000) % maximum});
    const calculator = new LineWinCalculator(config);
    return commands.map((command, index) => {
        const combination = combinations.generateSymbolsCombination();
        const screen = combination.toMatrix();
        const winMultiplier = Object.values(calculator.calculateWinningLines(1, combination)).reduce((total, line) => total + line.getWinAmount(), 0);
        return canonicalRound({sequence: index + 1, draw: draws[index * 2], stops: combinations.getLastStopPositions(), screen, winMultiplier, stake: command.bet as number, payout: winMultiplier * (command.bet as number), command});
    });
}

function canonicalRounds(rounds: readonly PokieWasmRound[]): readonly ReturnType<typeof canonicalRound>[] {
    return rounds.map(canonicalRound);
}

function canonicalRound(round: Pick<PokieWasmRound, "sequence" | "draw" | "stops" | "screen" | "winMultiplier" | "stake" | "payout" | "command">) {
    return {sequence: round.sequence, draw: round.draw, stops: round.stops, screen: round.screen, winMultiplier: round.winMultiplier, stake: round.stake, payout: round.payout, command: round.command};
}

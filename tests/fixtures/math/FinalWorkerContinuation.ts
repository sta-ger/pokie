import type * as Wasm from "@fromstan/pokie/wasm";

/** Runs inside the verifier's real installed Worker; never retains round history.
 * Copy counters bound continuation work independently of noisy heap/GC samples. */
export async function measureFinalWorkerContinuation(api: typeof Wasm, rounds: number, memory?: () => number) {
    const check = (condition: boolean, message: string): void => {
        if (!condition) throw new Error(message);
    };
    const artifact = await api.createBlueprintWasmArtifact({manifest: {id: "final-worker", name: "Final worker", version: "1"},
        reels: 3, rows: 1, symbols: ["A", "B"], wilds: [], scatters: [], paylines: [[0, 0, 0]],
        reelStrips: [["A", "B"], ["A", "B"], ["A", "B"]], paytable: {A: {3: 2}}, availableBets: [0.05]});
    const protocol = new api.PokieWasmWorkerProtocol();
    const send = async (request: Wasm.PokieWasmWorkerRequest) => {
        const response = await protocol.handle(request);
        if (!response.ok) throw new Error(response.error);
        return response.result;
    };
    const snapshots: {rounds: number; bytes: number; heapBytes: number | null}[] = [];
    try {
        await send({id: "start", type: "instantiate", bytes: artifact.bytes, manifest: artifact.manifest, seed: "0", credits: 100000});
        const baseline = memory?.();
        for (let index = 0; index <= rounds; index++) {
            let expectedNext: Wasm.PokieWasmRound | undefined;
            if (index === 0 || index === Math.floor(rounds / 10) || index === rounds) {
                const state = JSON.parse(JSON.stringify(await send({id: "state", type: "serialize"}))) as Wasm.PokieWasmSessionState;
                const size = JSON.stringify(state).length;
                check(size <= 512 && !("commands" in state) && !("draws" in state), "unbounded continuation snapshot");
                const heap = memory?.();
                if (heap !== undefined && baseline !== undefined) check(heap - baseline <= 64 * 1024 * 1024, "Worker heap exceeded 64 MiB growth budget");
                snapshots.push({rounds: index, bytes: size, heapBytes: heap ?? null});
                const fresh = await api.instantiatePokieWasm(artifact.bytes, artifact.manifest, new api.SeededPokieWasmHost("fresh"));
                try {
                    const restored = fresh.restoreSession(state);
                    check(fresh.getDiagnostics().generatedDraws === 0, "restore consumed RNG");
                    expectedNext = await restored.play({bet: 0.05});
                } finally {
                    fresh.dispose(); 
                }
                const before = await send({id: "before", type: "serialize"});
                const rejected = await protocol.handle({id: "tampered", type: "restore", state: {...state, artifactIdentity: "wrong"}});
                check(!rejected.ok, "tampered identity accepted");
                check(JSON.stringify(await send({id: "after", type: "serialize"})) === JSON.stringify(before), "rejected restore replaced state");
            }
            // Check the next accepted live draw without ever restoring/rewinding
            // that live stream. The final checkpoint has one explicit successor.
            if (index < rounds || expectedNext) {
                const actual = await send({id: "play", type: "play", command: {bet: 0.05}});
                if (expectedNext) check(JSON.stringify(actual) === JSON.stringify(expectedNext), "fresh restore next draw differs");
            }
        }
        const diagnostics = protocol.getDiagnostics() as Wasm.PokieWasmRuntimeDiagnostics & {inputTapeLength: number};
        check(diagnostics.inputTapeLength === 0, "ordinary continuation retained input tape");
        check(diagnostics.generatedDraws === 3 + 3 * (rounds + 1), "RNG draw consumption changed");
        check(diagnostics.hostPayloadBytes <= 32 * (rounds + 10), "continuation copy work grew with history");
        check(diagnostics.snapshotPayloadBytes <= 512 * 32, "checkpoint copy budget exceeded");
        check(await send({id: "trace", type: "trace"}) === null, "ordinary execution retained trace");
        return {rounds, acceptedRounds: rounds + 1, snapshots, diagnostics};
    } finally {
        const disposed = await protocol.handle({id: "dispose", type: "dispose"});
        check(disposed.ok, "protocol disposal failed");
    }
}

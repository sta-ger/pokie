/** Actual installed public entrypoints. No source aliases, build or npm calls. */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdir, readFile, readdir, realpath, symlink, writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {zstdCompressSync} from "node:zlib";

// The reviewed production fixture, including the original string seed "0".
export const P911_BLUEPRINT = Object.freeze({
    manifest:{id:"rng-parity", name:"RNG parity", version:"1.0.0"}, reels:2, rows:1, symbols:["A", "B"],
    reelStrips:[["A", "B"], ["A", "B"]], paylines:[[0, 0]], availableBets:[1], paytable:{A:{2:2}, B:{2:1}},
});
export function assertRareP911Metrics(mode) {
    const p = 2 ** -64;
    assert.equal(mode.totalWeight, "18446744073709551616");
    for (const [key, expected] of Object.entries({hitFrequency:p, maxWinProbability:p, rtp:2 * p, variance:4 * p * (1 - p), standardDeviation:2 ** -31})) {
        assert.ok(Number.isFinite(mode[key]) && mode[key] > 0 && Math.abs(mode[key] / expected - 1) <= 1e-12, `${key}: ${mode[key]} != ${expected}`);
    }
    assert.ok(Math.abs(mode.standardDeviation ** 2 / mode.variance - 1) <= 1e-12);
}

/** Resolve through native export conditions in an invocation-owned consumer, with no legacy alias. */
export async function prepareP911PublicConsumer(request) {
    const manifest = JSON.parse(await readFile(path.join(request.packageRoot, "package.json"), "utf8"));
    const packageName = request.packageName ?? manifest.name;
    assert.ok(["pokie", "@fromstan/pokie"].includes(packageName), "unsupported candidate package identity");
    assert.equal(manifest.name, packageName, "candidate package identity differs from authenticated request");
    assert.equal(manifest.version, request.packageVersion, "candidate package version differs from authenticated request");
    const workspace = path.join(request.profileRoot, "workspace");
    const link = path.join(workspace, "node_modules", packageName);
    await mkdir(path.dirname(link), {recursive: true});
    await symlink(request.packageRoot, link, "dir");
    const require = createRequire(path.join(workspace, "consumer.cjs"));
    const cjs = require.resolve(packageName);
    const packageRoot = await realpath(request.packageRoot);
    assert.ok((await realpath(cjs)).startsWith(`${packageRoot}${path.sep}`), "borrowed CJS runtime");
    if (request.resolutions) assert.equal(cjs, request.resolutions[packageName]);
    const names = [packageName, `${packageName}/wasm`, `${packageName}/browser`];
    const resolved = spawnSync(process.execPath, ["--input-type=module", "--eval", `
        process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(names)}.map(name => [name, import.meta.resolve(name)]))));
    `], {cwd: workspace, encoding: "utf8", timeout: 10_000});
    assert.ifError(resolved.error);
    assert.equal(resolved.status, 0, resolved.stderr);
    const urls = JSON.parse(resolved.stdout);
    for (const name of names) {
        const file = fileURLToPath(urls[name]);
        assert.ok((await realpath(file)).startsWith(`${packageRoot}${path.sep}`), `borrowed ESM export ${name}`);
        if (request.esmResolutions) assert.equal(file, request.esmResolutions[name]);
    }
    const api = require(packageName);
    const esm = await import(urls[packageName]);
    const wasm = await import(urls[`${packageName}/wasm`]);
    const browser = await import(urls[`${packageName}/browser`]);
    return {workspace, packageName, cjs, api, esm, wasm, browser, urls};
}

export async function runP911PublicScenario(request) {
    const observations = [];
    const {workspace, packageName, cjs, api, esm, wasm, browser} = await prepareP911PublicConsumer(request);
    for (const name of ["GamePackageGenerator", "loadPokieGameRuntime", "WasmArtifactBuilder", "StakeEngineOutcomeSourceReader", "StakeEngineStandaloneAnalyzer"]) assert.equal(typeof esm[name], "function", `ESM export ${name}`);
    assert.equal(typeof browser.instantiatePokieWasm, "function");
    const cli = (args, expectedCode = 0) => {
        const result = spawnSync(request.bin, args, {cwd:workspace, env:process.env, encoding:"utf8", timeout:30_000, maxBuffer:4 * 1024 * 1024});
        observations.push({surface:"installed-bin", args, exitCode:result.status, signal:result.signal, stdout:result.stdout, stderr:result.stderr});
        assert.ifError(result.error);
        assert.equal(result.signal, null);
        assert.equal(result.status, expectedCode, `${args.join(" ")}: ${result.stderr}`);
        return result;
    };
    const fixture = async (length = 2) => {
        const blueprint = {...P911_BLUEPRINT, reelStrips:Array.from({length:2}, () => Array.from({length}, (_, index) => index % 2 === 0 ? "A" : "B"))};
        const directory = path.join(workspace, `fixture-${length}`);
        await mkdir(directory);
        const generated = new api.GamePackageGenerator(request.packageVersion).generate(blueprint, directory);
        const declaration = JSON.parse(await readFile(path.join(generated.projectRoot, "package.json"), "utf8"));
        assert.equal(declaration.main, "./dist/index.js");
        assert.equal(declaration.exports, declaration.main); assert.equal(declaration.pokie.entry, declaration.main);
        assert.equal(createRequire(path.join(generated.projectRoot, declaration.main)).resolve(packageName), cjs);
        const loaded = await api.loadPokieGameRuntime(generated.projectRoot);
        try {
            const source = path.join(directory, "source.blueprint.json"), artifact = path.join(directory, "game.wasm");
            await writeFile(source, JSON.stringify(blueprint));
            await new api.WasmArtifactBuilder(request.packageVersion).build({type:"blueprint", rootPath:source, capabilities:api.PROJECT_TYPE_CAPABILITIES.blueprint, provenance:"P9-11"}, artifact);
            const project = await new api.ProjectTargetResolver().resolve(artifact);
            const descriptor = await api.readWasmComponentManifest(project);
            assert.equal(descriptor.supported, true);
            const bytes = new Uint8Array(await readFile(artifact));
            const runtime = await wasm.instantiatePokieWasm(bytes, descriptor.manifest, new wasm.SeededPokieWasmHost("0"));
            return {...loaded, bytes, manifest:descriptor.manifest, runtime};
        } catch (error) { await loaded.release(); throw error; }
    };
    const workerCall = async (worker, type, rest = {}) => {
        const response = await worker.handle({id:type, type, ...rest});
        assert.equal(response.ok, true, response.error);
        return response.result;
    };
    if (request.id === "node-wasm-first-subsequent") {
        for (const length of [2, 3]) {
            const f = await fixture(length);
            try {
                for (const seed of ["0", "wasm-parity-golden", "another-seed"]) {
                    const node = f.game.createSession({seed}), session = f.runtime.createSession(seed);
                    const initial = session.serialize();
                    await assert.rejects(session.play({bet:2}), /unavailable/);
                    assert.deepEqual(session.serialize(), initial);
                    const rounds = [];
                    for (let sequence = 1; sequence <= 4; sequence++) {
                        const creditsBefore = node.getCreditsAmount();
                        node.setBet(1); node.play();
                        const round = await session.play({bet:1});
                        assert.equal(round.sequence, sequence);
                        assert.deepEqual(round.screen, node.getSymbolsCombination().toMatrix());
                        assert.equal(round.payout, node.getWinAmount()); assert.equal(round.credits, node.getCreditsAmount());
                        assert.equal(round.creditsBefore, creditsBefore);
                        assert.equal(session.serialize().rngState, node.toSessionState().rngState);
                        rounds.push({screen:round.screen, payout:round.payout, credits:round.credits});
                    }
                    if (seed === "0" && length === 2) assert.deepEqual(rounds, [
                        {screen:[["A"], ["B"]], payout:0, credits:999}, {screen:[["B"], ["B"]], payout:1, credits:999},
                        {screen:[["B"], ["A"]], payout:0, credits:998}, {screen:[["A"], ["A"]], payout:2, credits:999},
                    ]);
                    observations.push({seed, length, rounds, continuation:session.serialize()});
                    session.dispose();
                }
            } finally { f.runtime.dispose(); await f.release(); }
        }
    } else if (request.id === "serialized-zero-replay") {
        const f = await fixture();
        try {
            const session = f.runtime.createSession("0"), initial = JSON.parse(JSON.stringify(session.serialize()));
            assert.equal(initial.sequence, 0); assert.equal(initial.drawCount, 2);
            const diagnostics = f.runtime.getDiagnostics();
            assert.deepEqual(session.serialize(), initial);
            assert.deepEqual(f.runtime.getDiagnostics().generatedDraws, diagnostics.generatedDraws);
            const expected = [await session.play({bet:1}), await session.play({bet:1})];
            const after = session.serialize();
            for (const advanced of [false, true]) {
                const receiver = await wasm.instantiatePokieWasm(f.bytes, f.manifest, new wasm.SeededPokieWasmHost("receiver"));
                try {
                    if (advanced) {
                        const unrelated = receiver.createSession("advanced");
                        for (let round = 0; round < 11; round++) await unrelated.play({bet:1});
                    }
                    const restored = receiver.restoreSession(initial);
                    assert.deepEqual([await restored.play({bet:1}), await restored.play({bet:1})], expected);
                    for (let repeat = 0; repeat < 2; repeat++) {
                        const replay = await receiver.replay(initial, [{bet:1}, {bet:1}]);
                        assert.deepEqual(replay.rounds, expected); assert.deepEqual(replay.stateAfter, after);
                        const sibling = receiver.createSession("sibling"); await sibling.play({bet:1}); sibling.dispose();
                    }
                    observations.push({advanced, initial, expected, after});
                } finally { receiver.dispose(); }
            }
            assert.deepEqual(session.serialize(), after);
            assert.deepEqual(await session.play({bet:1}), (await f.runtime.replay(after, [{bet:1}])).rounds[0]);
        } finally { f.runtime.dispose(); await f.release(); }
    } else if (request.id === "bounded-long-state") {
        // Node 24's type stripping loads only the existing test-data factory;
        // its imports are type-only. Runtime code still comes exclusively from
        // the authenticated installation, outside Jest and source aliases.
        const {createCanonicalWasmFixture} = await import("../tests/fixtures/wasm/createCanonicalWasmFixture.ts");
        const f = createCanonicalWasmFixture(), worker = new wasm.PokieWasmWorkerProtocol();
        assert.equal(f.manifest.artifact.sha256, "sha256:ced06d52f4f2d54e798e22b31834fea226a58c537bab5f117333f19ca213131b");
        const seed = "compact-measurement";
        const runtime = await wasm.instantiatePokieWasm(f.bytes, f.manifest, new wasm.SeededPokieWasmHost(seed));
        try {
            const session = runtime.createSession(seed, {credits:1_000_000});
            await workerCall(worker, "instantiate", {bytes:f.bytes, manifest:f.manifest, seed, credits:1_000_000});
            const started = performance.now();
            let totalPayout = 0;
            for (let round = 0; round <= 100_000; round++) {
                if ([0, 10_000, 100_000].includes(round)) {
                    const state = session.serialize(), workerState = await workerCall(worker, "serialize");
                    assert.deepEqual(state, workerState);
                    assert.deepEqual(Object.keys(state).sort(), ["credits", "drawCount", "rngState", "schemaVersion", "seed", "sequence"]);
                    assert.equal(state.schemaVersion, "pokie.state.v2"); assert.equal(state.sequence, round); assert.equal(state.drawCount, 2 + 2 * round);
                    const bytes = Buffer.byteLength(JSON.stringify(state)); assert.ok(bytes <= 192);
                    observations.push({round, bytes, state, elapsedMs:performance.now() - started, totalPayout, fixtureSha256:f.manifest.artifact.sha256});
                }
                if (round === 100_000) break;
                const settled = await session.play({bet:1}); totalPayout += settled.payout;
                assert.deepEqual(settled, await workerCall(worker, "play", {command:{bet:1}}));
            }
            for (const diagnostics of [runtime.getDiagnostics(), worker.getDiagnostics()]) {
                assert.equal(diagnostics.generatedDraws, 200002); assert.equal(diagnostics.hostRestorations, 100000);
                assert.ok(diagnostics.hostPayloadBytes <= 11 * 100001); assert.ok(diagnostics.snapshotPayloadBytes <= 3 * 192);
            }
            assert.equal(worker.getDiagnostics().inputTapeLength, 0); assert.equal(worker.getDiagnostics().verificationDraws, 0); assert.equal(worker.getDiagnostics().legacyPrefixDraws, 0);
            assert.equal(await workerCall(worker, "trace"), null);
            observations.push({directDiagnostics:runtime.getDiagnostics(), workerDiagnostics:worker.getDiagnostics()});
        } finally { try { await workerCall(worker, "dispose"); } finally { runtime.dispose(); } }
        assert.deepEqual(worker.getDiagnostics(), {inputTapeLength:0, verificationDraws:0, legacyPrefixDraws:0});
        // Explicit tape and opt-in trace are separately bounded resources,
        // never default continuation history or a machine-specific speed gate.
        const tracedRuntime = await wasm.instantiatePokieWasm(f.bytes, f.manifest, new wasm.SeededPokieWasmHost(seed));
        const trace = new wasm.BoundedPokieWasmTraceCollector(8);
        try {
            const collected = tracedRuntime.createSession(seed, {credits:1_000_000, trace});
            const ordinary = tracedRuntime.createSession(seed, {credits:1_000_000});
            for (let index = 0; index < 100; index++) assert.deepEqual(await collected.play({bet:1}), await ordinary.play({bet:1}));
            assert.deepEqual(collected.serialize(), ordinary.serialize()); assert.equal(trace.entries.length, 8);
            assert.equal(trace.entries.flatMap((entry) => entry.draws).length, 16); assert.equal(trace.dropped, 93);
            observations.push({resource:"opt-in-trace", capacity:8, retained:trace.entries.length, dropped:trace.dropped});
        } finally { tracedRuntime.dispose(); }
        assert.deepEqual(trace.entries, []);
        const tapeHost = new wasm.SeededPokieWasmHost(seed), draws = Array.from({length:20002}, () => tapeHost.nextRandom());
        try {
            await workerCall(worker, "instantiate", {bytes:f.bytes, manifest:f.manifest, seed, draws, credits:1_000_000});
            for (let index = 0; index < 10000; index++) await workerCall(worker, "play");
            const state = await workerCall(worker, "serialize"), diagnostics = worker.getDiagnostics();
            assert.equal(diagnostics.inputTapeLength, 20002); assert.equal(diagnostics.verificationDraws, 20002); assert.equal(diagnostics.legacyPrefixDraws, 0);
            assert.ok(Buffer.byteLength(JSON.stringify(state)) <= 384); assert.ok(diagnostics.hostPayloadBytes <= 256 * 10001);
            observations.push({resource:"explicit-tape", inputBytes:Buffer.byteLength(JSON.stringify(draws)), diagnostics});
        } finally { await workerCall(worker, "cancel"); }
    } else if (request.id === "stake-uint64-total") {
        const stake = path.join(workspace, "rare-stake"); await mkdir(stake);
        await writeFile(path.join(stake, "index.json"), JSON.stringify({modes:[{name:"base", cost:1, events:"books.jsonl.zst", weights:"lookup.csv"}]}));
        await writeFile(path.join(stake, "lookup.csv"), "0,18446744073709551615,0\n1,1,200\n");
        const books = [{id:0, payoutMultiplier:0, events:[]}, {id:1, payoutMultiplier:200, events:[{index:0, type:"bonus"}, {index:1, type:"bonus"}]}];
        await writeFile(path.join(stake, "books.jsonl.zst"), zstdCompressSync(Buffer.from(books.map((book) => JSON.stringify(book)).join("\n") + "\n")));
        const source = await new api.StakeEngineOutcomeSourceReader().readFromDirectory(stake);
        assert.deepEqual(source.modes[0].outcomes.map((outcome) => BigInt(outcome.weight)), [18446744073709551615n, 1n]);
        const analysis = new api.StakeEngineStandaloneAnalyzer().analyze(source).modes[0]; assertRareP911Metrics(analysis);
        await writeFile(path.join(stake, "pokie-manifest.json"), JSON.stringify({generatedBy:"pokie stakeengine export", generatedAt:new Date(0).toISOString()}));
        const destination = path.join(workspace, "report.json");
        const report = JSON.parse(cli(["report", stake, "--format", "json", "--out", destination]).stdout);
        assert.deepEqual(JSON.parse(await readFile(destination, "utf8")), report); assertRareP911Metrics(report.modes[0].analysis);
        for (const format of ["markdown", "html"]) {
            const text = cli(["report", stake, "--format", format]).stdout;
            assert.ok(text.includes("1.08e-17%") && text.includes("5.42e-18%") && text.includes("4.6566e-10"));
        }
        cli(["inspect", stake]); cli(["diff", stake, stake]);
        observations.push({analysis, persistedReport:destination, recognizedStudioSource:stake});
    } else if (request.id === "canonical-cli") {
        const help = cli(["--help"]).stdout;
        assert.doesNotMatch(help, /^ {2}export(?:\s|\[)|\bpokie export\b/m);
        const helpCommands = (text) => [...(text.split("Commands:")[1] ?? "").matchAll(/^ {2}([a-z][a-z-]*)(?=\s|\[)/gm)].map((match) => match[1]);
        const commands = helpCommands(help);
        assert.ok(commands.includes("build") && commands.includes("par"));
        for (const command of commands) {
            const text = cli([command, "--help"]).stdout;
            assert.doesNotMatch(text, /\bpokie export\b/);
            const nested = helpCommands(text);
            for (const verb of nested) cli([command, verb, "--help"]);
        }
        for (const target of ["blueprint", "tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook", "wasm"]) assert.ok(cli(["build", "--help"]).stdout.includes(target));
        const before = await readdir(workspace);
        for (const args of [["export"], ["export", "--help"], ["export", "missing.json", "--out", "removed"]]) {
            const rejected = cli(args, 1); assert.equal(rejected.stdout, ""); assert.match(rejected.stderr, /Unknown command "export".*Run `pokie .*--help`/);
        }
        assert.deepEqual(await readdir(workspace), before);
        const source = path.join(workspace, "source.blueprint.json"); await writeFile(source, JSON.stringify(P911_BLUEPRINT));
        for (const target of ["outcomeLibrary", "stakeAdapter", "parWorkbook"]) {
            const out = path.join(workspace, `${target}${target === "parWorkbook" ? ".xlsx" : ""}`);
            cli(["build", source, "--target", target, "--out", out]);
            if (target === "outcomeLibrary") assert.equal((await new api.OutcomeLibraryBundleReader().readManifest(out)).game.id, P911_BLUEPRINT.manifest.id);
            else if (target === "stakeAdapter") assert.equal((await new api.StakeEngineImporter().importFromDirectory(out)).modes.length, 1);
            else assert.deepEqual((await new api.ParSheetImporter().importFromFile(out)).blueprint, P911_BLUEPRINT);
        }
        const par = path.join(workspace, "nested.xlsx"); cli(["par", "export", source, "--out", par]);
        assert.deepEqual((await new api.ParSheetImporter().importFromFile(par)).blueprint, P911_BLUEPRINT);
    } else throw new Error(`Unknown P9-11 public scenario: ${request.id}`);
    return {kind:"p9-11-public-result", id:request.id, candidateId:request.candidateId, archiveSha256:request.archiveSha256, profileId:request.profileId, status:"passed", observations};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--request" || args[2] !== "--result") throw new Error("--request <json> --result <json> required");
    runP911PublicScenario(JSON.parse(await readFile(args[1], "utf8"))).then((result) => writeFile(args[3], `${JSON.stringify(result, null, 2)}\n`, {flag:"wx"}))
        .catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
}

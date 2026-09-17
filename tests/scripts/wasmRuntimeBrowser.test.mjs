import {createServer} from "http";
import {mkdirSync, mkdtempSync, rmSync} from "fs";
import {readFile, rm} from "fs/promises";
import path from "path";
import {spawn, spawnSync} from "child_process";
import {PORTABLE_RUNTIME_BROWSER_FIXTURE as canonicalFixture} from "../fixtures/wasm/portableRuntimeGolden.browser.mjs";

const root = process.cwd();
const portableRuntimeDirectory = preparePortableRuntime();
const benchmarkConfiguration = readBenchmarkConfiguration(process.argv);

function preparePortableRuntime() {
    // The browser and Worker must load the portable runtime emitted from this
    // exact checkout. A changed-tests run does not otherwise materialize dist/
    // before this standalone browser fixture, which could make it verify a
    // previous worker protocol instead of the source under review. Compile to
    // an isolated cache directory too: other focused checks may legitimately
    // build or package dist/ while this fixture is waiting for Chromium.
    const cacheDirectory = path.join(root, "node_modules", ".cache", "pokie-tmp");
    mkdirSync(cacheDirectory, {recursive: true});
    const outputDirectory = mkdtempSync(path.join(cacheDirectory, "wasm-browser-runtime-"));
    const compilation = spawnSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "--project", "tsconfig.prod.json", "--outDir", outputDirectory], {
        cwd: root,
        encoding: "utf8",
    });
    if (compilation.status !== 0) {
        rmSync(outputDirectory, {recursive: true, force: true});
        throw new Error(`Could not compile the portable runtime for the Chromium fixture:\n${compilation.stdout}\n${compilation.stderr}`);
    }
    return outputDirectory;
}

const workerModule = `import {PokieWasmWorkerProtocol} from "/runtime/wasm/worker.js";
const protocol = new PokieWasmWorkerProtocol();
self.onmessage = async ({data}) => self.postMessage(await protocol.handle(data));`;
const page = `<!doctype html><script type="module">
    import {instantiatePokieWasm, SeededPokieWasmHost} from "/runtime/wasm/browser.js";
    const fixture = ${JSON.stringify(canonicalFixture)};
    const benchmarkConfiguration = ${JSON.stringify(benchmarkConfiguration)};
    const decode = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    const assertFieldForField = (actual, expected, location = "result") => {
        if (Object.is(actual, expected)) return;
        if (Array.isArray(actual) || Array.isArray(expected)) {
            if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) throw new Error(location + " does not match the reviewed golden array shape");
            actual.forEach((entry, index) => assertFieldForField(entry, expected[index], location + "[" + index + "]"));
            return;
        }
        if (actual !== null && expected !== null && typeof actual === "object" && typeof expected === "object") {
            const actualKeys = Object.keys(actual).sort();
            const expectedKeys = Object.keys(expected).sort();
            if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) throw new Error(location + " does not match the reviewed golden fields");
            actualKeys.forEach((key) => assertFieldForField(actual[key], expected[key], location + "." + key));
            return;
        }
        throw new Error(location + " does not match the reviewed golden value");
    };
    const seededDraws = (seed, count) => {
        const host = new SeededPokieWasmHost(seed);
        return Array.from({length: count}, () => host.nextRandom());
    };
    window.pokieWasmBrowserResult = (async () => {
        if (fixture.manifest.component.id !== benchmarkConfiguration.fixtureId) throw new Error("browser benchmark received a different fixture than its configuration");
        const bytes = decode(fixture.bytes);
        const golden = fixture.golden;
        const mainRuntime = await instantiatePokieWasm(bytes, fixture.manifest, new SeededPokieWasmHost(golden.seed));
        const mainSession = mainRuntime.createSession(golden.seed);
        const mainRounds = [];
        for (const command of golden.commands) mainRounds.push(await mainSession.play(command));
        const mainState = mainSession.serialize();
        const continuationRuntime = await instantiatePokieWasm(decode(fixture.bytes), fixture.manifest, new SeededPokieWasmHost(golden.seed));
        const continuationSession = continuationRuntime.restoreSession(mainState);
        const continuation = await continuationSession.play(golden.continuationCommand);
        const continuationState = continuationSession.serialize();
        const replayRuntime = await instantiatePokieWasm(decode(fixture.bytes), fixture.manifest, new SeededPokieWasmHost(golden.seed));
        const replayResult = await replayRuntime.replay(mainState, [golden.continuationCommand]);
        const replayRounds = replayResult.rounds;
        const replay = {
            round: replayRounds[0].sequence,
            totalBet: [...mainRounds, ...replayRounds].reduce((total, round) => total + round.stake, 0),
            totalWin: [...mainRounds, ...replayRounds].reduce((total, round) => total + round.payout, 0),
            screen: replayRounds[0].screen,
        };
        assertFieldForField({draws: mainState.draws, rounds: mainRounds, state: mainState, continuation, replay}, golden.expected, "browser main-thread golden");
        assertFieldForField(replayResult, {rounds: [golden.expected.continuation], stateBeforeFinal: mainState, stateAfter: continuationState}, "browser replay result");
        mainSession.dispose();
        mainRuntime.dispose();
        continuationRuntime.dispose();
        replayRuntime.dispose();
        const coldStartedAt = performance.now();
        const runtime = await instantiatePokieWasm(bytes, fixture.manifest, new SeededPokieWasmHost(benchmarkConfiguration.fixtureSeed));
        const coldInstantiateMs = performance.now() - coldStartedAt;
        const correctnessSession = runtime.createSession(benchmarkConfiguration.fixtureSeed);
        const round = await correctnessSession.play({bet: 1});
        const correctnessState = correctnessSession.serialize();
        const expectedCorrectnessDraws = seededDraws(benchmarkConfiguration.fixtureSeed, correctnessState.draws.length);
        if (JSON.stringify(correctnessState.draws) !== JSON.stringify(expectedCorrectnessDraws) || round.draw !== expectedCorrectnessDraws[0]) throw new Error("browser benchmark did not consume the configured seeded host stream");
        correctnessSession.dispose();
        const warmSession = runtime.createSession(benchmarkConfiguration.fixtureSeed);
        for (let index = 0; index < benchmarkConfiguration.warmupRounds; index++) await warmSession.play({bet: 1});
        const warmStartedAt = performance.now();
        for (let index = 0; index < benchmarkConfiguration.measuredRounds; index++) await warmSession.play({bet: 1});
        const warmPlayMs = performance.now() - warmStartedAt;
        const serialized = warmSession.serialize();
        const serializationBytes = JSON.stringify(serialized).length;
        if (serialized.sequence !== benchmarkConfiguration.warmupRounds + benchmarkConfiguration.measuredRounds) throw new Error("browser benchmark warmup and measured loops did not complete");
        const expectedWarmDraws = seededDraws(benchmarkConfiguration.fixtureSeed, correctnessState.draws.length + serialized.draws.length).slice(correctnessState.draws.length);
        if (JSON.stringify(serialized.draws) !== JSON.stringify(expectedWarmDraws)) throw new Error("browser benchmark warmup and measured operations did not consume the configured seeded host stream");
        warmSession.dispose();
        const worker = new Worker("/worker.mjs", {type: "module"});
        try {
            const replies = [];
            const receive = () => new Promise((resolve, reject) => { worker.onmessage = ({data}) => resolve(data); worker.onerror = reject; });
            const workerStartedAt = performance.now();
            let response = receive();
            worker.postMessage({id: "before", type: "play"});
            replies.push(await response);
            const transferred = decode(fixture.bytes);
            const workerDraws = seededDraws(golden.seed, 10);
            response = receive();
            worker.postMessage({id: "instantiate", type: "instantiate", bytes: transferred, manifest: fixture.manifest, draws: workerDraws, seed: golden.seed}, [transferred.buffer]);
            replies.push(await response);
            if (transferred.byteLength !== 0) throw new Error("worker transfer did not detach the main-thread bytes");
            response = receive();
            worker.postMessage({id: "unknown", type: "unknown"});
            replies.push(await response);
            const workerRounds = [];
            for (const [index, command] of golden.commands.entries()) {
                response = receive();
                worker.postMessage({id: "play-" + (index + 1), type: "play", command});
                const reply = await response;
                replies.push(reply);
                if (!reply.ok) throw new Error("worker golden play failed: " + reply.error);
                workerRounds.push(reply.result);
            }
            response = receive();
            worker.postMessage({id: "state", type: "serialize"});
            replies.push(await response);
            const workerState = replies.at(-1).result;
            assertFieldForField(workerRounds, mainRounds, "worker rounds compared with browser main thread");
            assertFieldForField(workerState, mainState, "worker serialized state compared with browser main thread");
            response = receive();
            worker.postMessage({id: "replay", type: "replay", state: workerState, commands: [golden.continuationCommand]});
            const workerReplay = await response;
            replies.push(workerReplay);
            if (!workerReplay.ok) throw new Error("worker golden replay failed: " + workerReplay.error);
            assertFieldForField(workerReplay.result, replayResult, "worker replay result compared with browser main thread");
            response = receive();
            worker.postMessage({id: "replay-continuation", type: "replay", state: workerReplay.result.stateAfter, commands: [golden.continuationCommand]});
            const workerContinuation = await response;
            replies.push(workerContinuation);
            if (!workerContinuation.ok || workerContinuation.result.rounds[0]?.sequence !== workerReplay.result.stateAfter.sequence + 1) throw new Error("worker replay continuation failed");
            response = receive();
            worker.postMessage({id: "cancel", type: "cancel"});
            replies.push(await response);
            response = receive();
            worker.postMessage({id: "after", type: "serialize"});
            replies.push(await response);
            const workerRoundTripMs = performance.now() - workerStartedAt;
            if (!replies[0].ok && replies[1].ok && !replies[2].ok && replies.slice(3, 9).every((reply) => reply.ok) && replies[9].ok && !replies[10].ok) {
                return {...benchmarkConfiguration, status: "PASS", coldInstantiateMs, warmPlayMs, workerRoundTripMs, serializationBytes};
            }
            throw new Error("worker protocol errors, cancellation, or cleanup failed");
        } finally {
            const terminationResult = worker.terminate();
            if (terminationResult !== undefined) throw new Error("browser Worker termination did not complete synchronously");
            runtime.dispose();
        }
    })();
</script>`;

const server = createServer(async (request, response) => {
    if (request.url === "/fixture.html") return response.end(page);
    if (request.url === "/worker.mjs") {
        response.setHeader("Content-Type", "text/javascript");
        return response.end(workerModule);
    }
    if (request.url?.startsWith("/runtime/")) {
        try {
            const file = path.resolve(portableRuntimeDirectory, `.${request.url.slice("/runtime".length)}`);
            if (!file.startsWith(portableRuntimeDirectory)) throw new Error("invalid path");
            response.setHeader("Content-Type", "text/javascript");
            return response.end(await readFile(file));
        } catch {
            response.statusCode = 404;
            return response.end();
        }
    }
    response.statusCode = 404;
    response.end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (address === null || typeof address === "string") throw new Error("Browser fixture server did not bind a TCP port.");
const chromium = process.env.CHROMIUM_PATH ?? "/snap/bin/chromium";
const includeMeasurements = process.argv.includes("--benchmark");
const portableRuntimeBytes = await collectPortableRuntimeBytes([
    path.join(portableRuntimeDirectory, "wasm", "browser.js"),
    path.join(portableRuntimeDirectory, "wasm", "worker.js"),
]);
const browser = spawn(chromium, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--remote-debugging-pipe"], {stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"]});
let requestId = 0;
let buffer = "";
const pending = new Map();
browser.stdio[4].on("data", (chunk) => {
    buffer += chunk;
    let separator;
    while ((separator = buffer.indexOf("\0")) >= 0) {
        const response = JSON.parse(buffer.slice(0, separator));
        buffer = buffer.slice(separator + 1);
        const resolve = pending.get(response.id);
        if (resolve !== undefined) {
            pending.delete(response.id);
            resolve(response);
        }
    }
});
function call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
        const id = ++requestId;
        pending.set(id, (response) => response.error === undefined ? resolve(response.result) : reject(new Error(response.error.message)));
        browser.stdio[3].write(`${JSON.stringify({id, method, params, ...(sessionId === undefined ? {} : {sessionId})})}\0`);
    });
}
try {
    const browserVersion = await call("Browser.getVersion");
    const target = await call("Target.createTarget", {url: "about:blank"});
    const attached = await call("Target.attachToTarget", {targetId: target.targetId, flatten: true});
    await call("Page.enable", {}, attached.sessionId);
    await call("Page.navigate", {url: `http://127.0.0.1:${address.port}/fixture.html`}, attached.sessionId);
    const result = await call("Runtime.evaluate", {expression: "(async () => { while (!window.pokieWasmBrowserResult) await new Promise(requestAnimationFrame); return await window.pokieWasmBrowserResult; })()", awaitPromise: true, returnByValue: true}, attached.sessionId);
    if (result.result.value?.status !== "PASS") throw new Error(`Chromium browser fixture returned ${JSON.stringify(result)}`);
    if (includeMeasurements) {
        console.log(`POKIE_WASM_BROWSER_BENCHMARK=${JSON.stringify({
            chromium: browserVersion.product,
            ...benchmarkConfiguration,
            rawModuleBytes: Buffer.from(canonicalFixture.bytes, "base64").byteLength,
            manifestBytes: Buffer.byteLength(JSON.stringify(canonicalFixture.manifest)),
            portableRuntimeBytes,
            completePackagedArtifactBytes: Buffer.from(canonicalFixture.bytes, "base64").byteLength + Buffer.byteLength(JSON.stringify(canonicalFixture.manifest)) + portableRuntimeBytes,
            ...result.result.value,
        })}`);
    }
} finally {
    const browserClosed = new Promise((resolve) => browser.once("close", resolve));
    browser.kill();
    await browserClosed;
    await new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
    await rm(portableRuntimeDirectory, {recursive: true, force: true});
}
console.log("PASS real Chromium shipped browser API and worker protocol fixture");

// The changed-tests runner dispatches this executable fixture through Jest,
// while the benchmark invokes it directly with Node. Registering the completed
// fixture with Jest keeps both supported entry paths runnable without giving
// the browser verification a separate wrapper or a duplicate execution.
if (typeof test === "function") test("runs the real Chromium WASM fixture", () => undefined);

function readBenchmarkConfiguration(argumentsList) {
    const encoded = argumentsList.find((argument) => argument.startsWith("--benchmark-configuration="));
    if (encoded === undefined) {
        return {
            fixtureId: canonicalFixture.manifest.component.id,
            fixtureSeed: "wasm-benchmark-seed",
            warmupRounds: 10,
            measuredRounds: 100,
        };
    }
    const configuration = JSON.parse(encoded.slice("--benchmark-configuration=".length));
    if (configuration.fixtureId !== canonicalFixture.manifest.component.id || typeof configuration.fixtureSeed !== "string" || configuration.fixtureSeed.length === 0 || !Number.isInteger(configuration.warmupRounds) || configuration.warmupRounds < 0 || !Number.isInteger(configuration.measuredRounds) || configuration.measuredRounds <= 0) {
        throw new Error("invalid WASM browser benchmark configuration");
    }
    return configuration;
}

async function collectPortableRuntimeBytes(entries) {
    const visited = new Set();
    const collect = async (file) => {
        const resolved = path.resolve(file);
        if (visited.has(resolved)) return 0;
        visited.add(resolved);
        const source = await readFile(resolved, "utf8");
        let total = Buffer.byteLength(source);
        const imports = source.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g);
        for (const match of imports) {
            const imported = path.resolve(path.dirname(resolved), match[1]);
            total += await collect(imported);
        }
        return total;
    };
    return (await Promise.all(entries.map(collect))).reduce((total, bytes) => total + bytes, 0);
}

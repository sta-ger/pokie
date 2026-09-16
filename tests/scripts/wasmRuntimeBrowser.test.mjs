import {createServer} from "http";
import {readFile} from "fs/promises";
import path from "path";
import {spawn} from "child_process";
import {PORTABLE_RUNTIME_BROWSER_FIXTURE as canonicalFixture} from "../fixtures/wasm/portableRuntimeGolden.browser.mjs";

const root = process.cwd();

const workerModule = `import {PokieWasmWorkerProtocol} from "/dist/esm/wasm/worker.js";
const protocol = new PokieWasmWorkerProtocol();
self.onmessage = async ({data}) => self.postMessage(await protocol.handle(data));`;
const page = `<!doctype html><script type="module">
    import {instantiatePokieWasm} from "/dist/esm/wasm/browser.js";
    const fixture = ${JSON.stringify(canonicalFixture)};
    const decode = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    window.pokieWasmBrowserResult = (async () => {
        const bytes = decode(fixture.bytes);
        const coldStartedAt = performance.now();
        const runtime = await instantiatePokieWasm(bytes, fixture.manifest, {nextRandom: () => 0.25});
        const coldInstantiateMs = performance.now() - coldStartedAt;
        const round = await runtime.createSession("browser").play();
        const warmSession = runtime.createSession("browser-warm");
        const warmStartedAt = performance.now();
        for (let index = 0; index < 10; index++) await warmSession.play();
        const warmPlayMs = performance.now() - warmStartedAt;
        warmSession.dispose();
        const serialized = runtime.createSession("browser-serialize").serialize();
        const serializationBytes = JSON.stringify(serialized).length;
        if (round.draw !== 0.25) throw new Error("shipped browser API did not run the canonical fixture");
        const worker = new Worker("/worker.mjs", {type: "module"});
        const replies = [];
        const receive = () => new Promise((resolve, reject) => { worker.onmessage = ({data}) => resolve(data); worker.onerror = reject; });
        const workerStartedAt = performance.now();
        let response = receive();
        worker.postMessage({id: "before", type: "play"});
        replies.push(await response);
        const transferred = decode(fixture.bytes);
        response = receive();
        worker.postMessage({id: "instantiate", type: "instantiate", bytes: transferred, manifest: fixture.manifest, draws: [0.25, 0.75]}, [transferred.buffer]);
        replies.push(await response);
        if (transferred.byteLength !== 0) throw new Error("worker transfer did not detach the main-thread bytes");
        response = receive();
        worker.postMessage({id: "play", type: "play"});
        replies.push(await response);
        response = receive();
        worker.postMessage({id: "cancel", type: "cancel"});
        replies.push(await response);
        response = receive();
        worker.postMessage({id: "after", type: "serialize"});
        replies.push(await response);
        const workerRoundTripMs = performance.now() - workerStartedAt;
        worker.terminate();
        runtime.dispose();
        if (!replies[0].ok && replies[1].ok && replies[2].ok && replies[3].ok && !replies[4].ok) {
            return {status: "PASS", coldInstantiateMs, warmPlayMs, workerRoundTripMs, serializationBytes};
        }
        throw new Error("worker protocol errors, cancellation, or cleanup failed");
    })();
</script>`;

const server = createServer(async (request, response) => {
    if (request.url === "/fixture.html") return response.end(page);
    if (request.url === "/worker.mjs") {
        response.setHeader("Content-Type", "text/javascript");
        return response.end(workerModule);
    }
    if (request.url?.startsWith("/dist/")) {
        try {
            const file = path.resolve(root, `.${request.url}`);
            if (!file.startsWith(path.join(root, "dist"))) throw new Error("invalid path");
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
    path.join(root, "dist", "esm", "wasm", "browser.js"),
    path.join(root, "dist", "esm", "wasm", "worker.js"),
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
            rawModuleBytes: Buffer.from(canonicalFixture.bytes, "base64").byteLength,
            manifestBytes: Buffer.byteLength(JSON.stringify(canonicalFixture.manifest)),
            portableRuntimeBytes,
            completePackagedArtifactBytes: Buffer.from(canonicalFixture.bytes, "base64").byteLength + Buffer.byteLength(JSON.stringify(canonicalFixture.manifest)) + portableRuntimeBytes,
            ...result.result.value,
        })}`);
    }
} finally {
    browser.kill();
    await new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
}
console.log("PASS real Chromium shipped browser API and worker protocol fixture");

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

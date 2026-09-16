import {createServer} from "http";
import {readFile} from "fs/promises";
import path from "path";
import {spawn} from "child_process";

const root = process.cwd();
const canonicalFixture = {
    bytes: "AGFzbQEAAAABBQFgAAF/AhUBBXBva2llC25leHRfcmFuZG9tAAADAgEABwgBBHBsYXkAAQoGAQQAEAALAKIBDXBva2llLmdhbWUudjF7InNjaGVtYVZlcnNpb24iOiJwb2tpZS5nYW1lLnYxIiwicmVlbHMiOjEsInJvd3MiOjEsInJlZWxTdHJpcHMiOltbIkEiLCJCIl1dLCJwYXlsaW5lcyI6W1swXV0sInBheXRhYmxlIjp7IkEiOnsiMSI6Mn0sIkIiOnsiMSI6MX19LCJzdG9wV2lkdGhzIjpbMV19ANQDEnBva2llLmNvbXBvbmVudC52MXsic2NoZW1hVmVyc2lvbiI6IjEuMC4wIiwiY29tcG9uZW50Ijp7ImlkIjoiYnJvd3Nlci1jYW5vbmljYWwiLCJ2ZXJzaW9uIjoiMS4wLjAifSwic2VyaWFsaXphdGlvbiI6eyJzZXNzaW9uIjoicG9raWUuc2Vzc2lvbi52MSIsInBsYXkiOiJwb2tpZS5wbGF5LnYxIiwic3RhdGUiOiJwb2tpZS5zdGF0ZS52MSJ9LCJob3N0Ijp7InJuZyI6InBva2llLnJuZy52MSIsInNlcnZpY2VzIjpbXX0sImNhcGFiaWxpdGllcyI6WyJydW50aW1lLnBsYXkiLCJydW50aW1lLnNlcmlhbGl6ZSJdLCJhcnRpZmFjdCI6eyJmb3JtYXQiOiJwb2tpZS53YXNtLnYxIiwiYWJpVmVyc2lvbiI6IjEuMC4wIiwiYWRhcHRlciI6InBva2llL3dhc20iLCJjb25maWd1cmF0aW9uSGFzaCI6InNoYTI1NjphMWFlMzFiNzI3NTEzMmRjZDQ3YTBiNTY3MzI3NzYyMjZmOGM4ZGQ5YTQ3ZmEwYTk5ZDQwOWU4YTczMzk2YWFiIn19",
    manifest: {schemaVersion: "1.0.0", component: {id: "browser-canonical", version: "1.0.0"}, serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"}, host: {rng: "pokie.rng.v1", services: []}, capabilities: ["runtime.play", "runtime.serialize"], artifact: {format: "pokie.wasm.v1", sha256: "sha256:885caa9631b93de104c4cf57a03803ecfc6ccf5bdf54097c56ff21ab6380d158", bytes: 696, abiVersion: "1.0.0", adapter: "pokie/wasm", configurationHash: "sha256:a1ae31b7275132dcd47a0b56732776226f8c8dd9a47fa0a99d409e8a73396aab"}},
};

const workerModule = `import {PokieWasmWorkerProtocol} from "/dist/esm/wasm/worker.js";
const protocol = new PokieWasmWorkerProtocol();
self.onmessage = async ({data}) => self.postMessage(await protocol.handle(data));`;
const page = `<!doctype html><script type="module">
    import {instantiatePokieWasm} from "/dist/esm/wasm/browser.js";
    const fixture = ${JSON.stringify(canonicalFixture)};
    const decode = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    window.pokieWasmBrowserResult = (async () => {
        const bytes = decode(fixture.bytes);
        const runtime = await instantiatePokieWasm(bytes, fixture.manifest, {nextRandom: () => 0.25});
        const round = await runtime.createSession("browser").play();
        runtime.dispose();
        if (round.draw !== 0.25) throw new Error("shipped browser API did not run the canonical fixture");
        const worker = new Worker("/worker.mjs", {type: "module"});
        const replies = [];
        const receive = () => new Promise((resolve, reject) => { worker.onmessage = ({data}) => resolve(data); worker.onerror = reject; });
        let response = receive();
        worker.postMessage({id: "before", type: "play"});
        replies.push(await response);
        const transferred = decode(fixture.bytes);
        response = receive();
        worker.postMessage({id: "instantiate", type: "instantiate", bytes: transferred, manifest: fixture.manifest, draws: [0.25]}, [transferred.buffer]);
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
        worker.terminate();
        if (!replies[0].ok && replies[1].ok && replies[2].ok && replies[3].ok && !replies[4].ok) return "PASS";
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
    const target = await call("Target.createTarget", {url: "about:blank"});
    const attached = await call("Target.attachToTarget", {targetId: target.targetId, flatten: true});
    await call("Page.enable", {}, attached.sessionId);
    await call("Page.navigate", {url: `http://127.0.0.1:${address.port}/fixture.html`}, attached.sessionId);
    const result = await call("Runtime.evaluate", {expression: "(async () => { while (!window.pokieWasmBrowserResult) await new Promise(requestAnimationFrame); return await window.pokieWasmBrowserResult; })()", awaitPromise: true, returnByValue: true}, attached.sessionId);
    if (result.result.value !== "PASS") throw new Error(`Chromium browser fixture returned ${JSON.stringify(result)}`);
} finally {
    browser.kill();
    await new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
}
console.log("PASS real Chromium shipped browser API and worker protocol fixture");

import {spawnSync} from "child_process";

const wasmBytes = [
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
    0x02, 0x15, 0x01, 0x05, 0x70, 0x6f, 0x6b, 0x69, 0x65, 0x0b, 0x6e, 0x65, 0x78, 0x74, 0x5f, 0x72, 0x61, 0x6e, 0x64, 0x6f, 0x6d, 0x00, 0x00,
    0x03, 0x02, 0x01, 0x00, 0x07, 0x08, 0x01, 0x04, 0x70, 0x6c, 0x61, 0x79, 0x00, 0x01,
    0x0a, 0x06, 0x01, 0x04, 0x00, 0x10, 0x00, 0x0b,
];

const workerSource = `onmessage = async ({data}) => {
    if (data.type === "play") {
        const bytes = new Uint8Array(data.bytes);
        const instance = await WebAssembly.instantiate(bytes, {pokie: {next_random: () => Math.floor(data.draw * 0x80000000)}});
        postMessage({type: "round", packed: instance.instance.exports.play()});
    }
    if (data.type === "cancel") { postMessage({type: "cancelled"}); close(); }
};`;
const html = `<!doctype html><body><script>
    (async () => {
        const bytes = new Uint8Array(${JSON.stringify(wasmBytes)});
        const main = await WebAssembly.instantiate(bytes, {pokie: {next_random: () => Math.floor(0.25 * 0x80000000)}});
        if (main.instance.exports.play() !== 536870912) throw new Error("main-thread WASM result mismatch");
        const worker = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}], {type: "text/javascript"})));
        const messages = [];
        const done = new Promise((resolve, reject) => {
            worker.onmessage = ({data}) => {
                messages.push(data);
                if (data.type === "round") worker.postMessage({type: "cancel"});
                if (data.type === "cancelled") resolve();
            };
            worker.onerror = reject;
        });
        worker.postMessage({type: "play", bytes: bytes.buffer, draw: 0.75}, [bytes.buffer]);
        await done;
        worker.terminate();
        if (messages.length !== 2 || messages[0].packed !== 1610612736 || messages[1].type !== "cancelled") throw new Error("worker protocol or cleanup mismatch");
        document.body.dataset.result = "PASS";
    })().catch((error) => { document.body.dataset.result = "FAIL"; document.body.textContent = String(error); });
</script></body>`;

const chromium = process.env.CHROMIUM_PATH ?? "/snap/bin/chromium";
const page = `data:text/html;base64,${Buffer.from(html).toString("base64")}`;
const result = spawnSync(chromium, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--virtual-time-budget=5000", "--dump-dom", page], {encoding: "utf8"});
if (result.status !== 0 || !/<body data-result="PASS">/.test(result.stdout)) {
    throw new Error(`Chromium browser fixture failed (status ${result.status}): ${result.stdout}\n${result.stderr}`);
}
console.log("PASS real Chromium WASM main-thread and Worker cancellation fixture");

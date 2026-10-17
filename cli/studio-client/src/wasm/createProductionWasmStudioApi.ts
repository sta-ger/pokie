import {BrowserWasmStudioApi} from "./BrowserWasmStudioApi";
import type {FetchLike} from "../api/apiClient";

export function createProductionWasmStudioApi(network: FetchLike): FetchLike {
    const owner = new BrowserWasmStudioApi(network, () => new Worker(new URL("./pokie.worker.ts", import.meta.url), {type: "module", name: "pokie-wasm-project"}));
    window.addEventListener("pagehide", () => owner.dispose((url, body) => navigator.sendBeacon(url, new Blob([body], {type: "application/json"}))));
    return owner.fetch;
}

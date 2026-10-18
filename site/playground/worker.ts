import {installPokieWasmWorker, type PokieWasmWorkerPort} from "../../src/wasm/browser.js";
installPokieWasmWorker(globalThis as unknown as PokieWasmWorkerPort);

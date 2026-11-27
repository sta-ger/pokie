import {describeWasmSidecarFailure} from "../../src/project/WasmProductContract.js";

describe("describeWasmSidecarFailure", () => {
    it("separates a malformed-sidecar cause from its repair sentence", () => {
        const message = describeWasmSidecarFailure("/game.wasm", "/game.wasm.pokie-wasm.json", "malformed", "it is not valid JSON");
        expect(message).toContain('is malformed: it is not valid JSON. Repair the malformed sidecar');
        expect(message).not.toContain("JSON Repair");
    });

    it("does not duplicate terminal punctuation already present in the detail", () => {
        const message = describeWasmSidecarFailure("/game.wasm", "/game.wasm.pokie-wasm.json", "incompatible", "schema version is newer.");
        expect(message).toContain("not compatible with this POKIE build: schema version is newer. Update the incompatible sidecar");
        expect(message).not.toContain("newer..");
    });

    it("keeps a no-detail cause as its own sentence", () => {
        const message = describeWasmSidecarFailure("/game.wasm", "/game.wasm.pokie-wasm.json", "missing");
        expect(message).toContain('was found at "/game.wasm.pokie-wasm.json". Add a valid compatible sidecar');
    });
});

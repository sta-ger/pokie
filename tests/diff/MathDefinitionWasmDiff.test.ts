import fs from "fs";
import os from "os";
import path from "path";
import {compareMathDefinitions} from "../../src/diff/MathDefinitionSourceReader.js";
import {createCanonicalWasmFixture} from "../fixtures/wasm/createCanonicalWasmFixture.js";

describe("canonical WASM definition diff", () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-wasm-diff-"));
    });

    afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
    });

    it("keeps two identical canonical WASM revisions identical despite partial authoring coverage", async () => {
        const fixture = createCanonicalWasmFixture({
            id: "wasm-diff",
            reelStrips: [["A", "B"], ["A", "B"]],
            paytable: {A: {2: 2}, B: {2: 1}},
        });
        const left = path.join(root, "left.wasm");
        const right = path.join(root, "right.wasm");
        for (const file of [left, right]) {
            fs.writeFileSync(file, fixture.bytes);
            fs.writeFileSync(`${file}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
        }

        const diff = await compareMathDefinitions(left, right);

        expect(diff.status).toBe("identical");
        expect(diff.left.support).toBe("partial");
        expect(diff.right.support).toBe("partial");
        expect(diff.left.identity.revision).toBe(diff.right.identity.revision);
        expect(diff.changes).toEqual([]);
    });
});

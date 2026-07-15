import fs from "fs";
import os from "os";
import path from "path";
import {writeExternalDeploymentArtifactsToDirectory} from "pokie";

describe("writeExternalDeploymentArtifactsToDirectory", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-write-external-artifacts-test-"));
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    it("writes every artifact, creating nested directories as needed", () => {
        const written = writeExternalDeploymentArtifactsToDirectory(
            [
                {relativePath: "index.json", content: `{"a":1}`},
                {relativePath: "base/0.json", content: `{"b":2}`},
            ],
            outDir,
        );

        expect(written).toHaveLength(2);
        expect(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")).toBe(`{"a":1}`);
        expect(fs.readFileSync(path.join(outDir, "base", "0.json"), "utf-8")).toBe(`{"b":2}`);
    });

    it("writes Buffer content as-is", () => {
        writeExternalDeploymentArtifactsToDirectory([{relativePath: "data.bin", content: Buffer.from([1, 2, 3])}], outDir);
        expect(fs.readFileSync(path.join(outDir, "data.bin"))).toEqual(Buffer.from([1, 2, 3]));
    });

    it("throws rather than write outside outDir when relativePath escapes via ..", () => {
        expect(() => writeExternalDeploymentArtifactsToDirectory([{relativePath: "../escaped.json", content: "{}"}], outDir)).toThrow(/escapes the output directory/);
        expect(fs.existsSync(path.join(path.dirname(outDir), "escaped.json"))).toBe(false);
    });

    it("throws rather than write an absolute path", () => {
        const absoluteEscape = path.join(os.tmpdir(), "pokie-external-adapter-absolute-escape.json");
        expect(() => writeExternalDeploymentArtifactsToDirectory([{relativePath: absoluteEscape, content: "{}"}], outDir)).toThrow(/escapes the output directory/);
        expect(fs.existsSync(absoluteEscape)).toBe(false);
    });
});

import fs from "fs";
import os from "os";
import path from "path";
import {ProjectTargetResolver} from "@fromstan/pokie";

describe("ProjectTargetResolver unchanged-package cache", () => {
    it("reuses the provenance-free tsPackage DTO until the declared entry changes", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-resolver-cache-"));
        const fixture = path.join(__dirname, "..", "gamepackage", "fixtures", "valid-game");
        fs.cpSync(fixture, root, {recursive: true});
        try {
            const resolver = new ProjectTargetResolver();

            const first = await resolver.resolve(root, {readConfigurationProvenance: false});
            const second = await resolver.resolve(root, {readConfigurationProvenance: false});
            expect(first?.type).toBe("tsPackage");
            expect(second).toEqual(first);

            fs.appendFileSync(path.join(root, "index.js"), "\n// rebuilt\n");
            const rebuilt = await resolver.resolve(root, {readConfigurationProvenance: false});
            expect(rebuilt?.type).toBe("tsPackage");
            expect(rebuilt).not.toBe(first);
            expect(rebuilt?.rootPath).toBe(path.resolve(root));
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });
});

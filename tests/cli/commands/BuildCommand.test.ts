import fs from "fs";
import os from "os";
import path from "path";
import {GameBlueprintValidator, PackageBlueprintExtraction} from "@fromstan/pokie";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {writeDescriptorPackage} from "../../v2/fixtures/PackageExtractionFixture.js";

describe("canonical package extraction CLI", () => {
    let root: string;
    let log: jest.SpyInstance;
    let error: jest.SpyInstance;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-extraction-"));
        log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });
    afterEach(() => {
        log.mockRestore();
        error.mockRestore();
        fs.rmSync(root, {recursive: true, force: true});
    });
    const command = () => new BuildCommand("1.3.0");
    const output = () => log.mock.calls.flat().join("\n");

    it("previews every supplied field and saves the same library extraction plus evidence explicitly", async () => {
        const source = writeDescriptorPackage(root);
        const bytes = fs.readFileSync(path.join(source, "index.js"));
        const extracted = await new PackageBlueprintExtraction().extract(source);
        const destination = path.join(root, "model.json");
        expect(await command().run([source, "--target", "blueprint", "--out", destination, "--dry-run"])).toBe(0);
        for (const field of extracted.fields) expect(output()).toContain(`${field.path}: ${field.status}: ${field.authority}`);
        for (const limit of extracted.comparisonLimits) expect(output()).toContain(limit);
        expect(output()).toContain(source);
        expect(output()).toContain(`${destination}.conversion-evidence.json`);
        expect(fs.readdirSync(root)).toEqual(["descriptor-package"]);
        expect(await command().run([source, "--target", "blueprint", "--out", destination])).toBe(0);
        const blueprint = JSON.parse(fs.readFileSync(destination, "utf8"));
        expect(new GameBlueprintValidator().validate(blueprint).filter(issue => issue.severity === "error")).toEqual([]);
        expect(JSON.parse(fs.readFileSync(`${destination}.conversion-evidence.json`, "utf8"))).toEqual({
            schemaVersion: 1, kind: "package-extraction", sourceBindingHash: expect.stringMatching(/^sha256:/),
            extractedBlueprintHash: extracted.blueprintHash, extraction: extracted,
        });
        expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(bytes);
    });

    it("keeps default sibling destination and extraction in build help", async () => {
        const source = writeDescriptorPackage(root);
        const help = command().getCommanderCommand();
        expect(help.name()).toBe("build");
        expect(help.commands.map(child => child.name())).not.toContain("export");
        expect(help.helpInformation()).toMatch(/blueprint/);
        expect(help.helpInformation()).toMatch(/--dry-run/);
        expect(await command().run([source, "--target", "blueprint", "--dry-run"])).toBe(0);
        expect(output()).toContain(path.join(root, "blueprint.json"));
        expect(fs.readdirSync(root)).toEqual(["descriptor-package"]);
    });

    it.each(["model.json", "model.json.conversion-evidence.json"])("preserves occupied %s", async occupied => {
        const source = writeDescriptorPackage(root);
        const destination = path.join(root, "model.json");
        const existing = path.join(root, occupied);
        fs.writeFileSync(existing, "existing owner");
        await expect(command().run([source, "--target", "blueprint", "--out", destination])).rejects.toThrow(/destination is unavailable/);
        expect(fs.readFileSync(existing, "utf8")).toBe("existing owner");
        expect(fs.readdirSync(root).sort()).toEqual(["descriptor-package", occupied].sort());
    });

    it.each(["partial", "unsupported", "malformed"])("retains %s diagnostics and never publishes", async status => {
        let descriptorBody = 'throw new Error("broken descriptor");';
        if (status === "partial") descriptorBody = 'return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model: {manifest: model.manifest}};';
        if (status === "unsupported") descriptorBody = 'return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model, unsupported: [{path: "mechanics.custom", code: "opaque-feature", message: "Custom behavior cannot be represented"}]};';
        const source = writeDescriptorPackage(root, {descriptorBody});
        const bytes = fs.readFileSync(path.join(source, "index.js"));
        await expect(command().run([source, "--target", "blueprint", "--out", path.join(root, "model.json")])).rejects.toThrow(`extraction ${status}`);
        expect(output()).toContain(`package model ${status}`);
        expect(output()).toContain("comparison boundary");
        if (status === "unsupported") {
            expect(output()).toContain("mechanics.custom: opaque-feature: Custom behavior cannot be represented");
            expect(output()).toContain("mechanics.custom: unsupported: opaque-feature");
        }
        expect(fs.readdirSync(root)).toEqual(["descriptor-package"]);
        expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(bytes);
    });
});

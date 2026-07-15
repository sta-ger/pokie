import fs from "fs";
import os from "os";
import path from "path";
import {
    ExternalDeploymentCompatibilityValidator,
    ExternalDeploymentModeInput,
    ExternalDeploymentTargetRegistry,
    StandardExternalArtifactValidator,
    createLocalJsonExternalDeploymentTarget,
} from "pokie";
import {externalAdapterTestLibrary} from "./ExternalAdapterTestFixtures.js";

describe("createLocalJsonExternalDeploymentTarget (end-to-end SDK pipeline)", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-externaladapter-test-"));
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    it("registers, validates compatibility, generates, validates output, diagnoses, and delivers a single-mode deployment", async () => {
        const target = createLocalJsonExternalDeploymentTarget({outDir});
        const registry = new ExternalDeploymentTargetRegistry();
        registry.register(target);

        expect(registry.get("local-json-example")).toBe(target);

        const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib"})}];

        const compatibilityIssues = new ExternalDeploymentCompatibilityValidator().validate({target, modes});
        expect(compatibilityIssues).toEqual([]);

        const generationResult = target.artifactGenerator.generate(modes);
        expect(generationResult.issues).toEqual([]);
        expect(generationResult.artifacts.map((artifact) => artifact.relativePath).sort()).toEqual(["base/loss.json", "base/win.json", "index.json"]);

        const artifactIssues = (target.artifactValidator ?? new StandardExternalArtifactValidator()).validate(generationResult);
        expect(artifactIssues).toEqual([]);

        const diagnosticReport = await target.diagnostic?.diagnose();
        expect(diagnosticReport?.ok).toBe(true);

        const deliveryResult = await target.runtimeAdapter?.deliver(generationResult);
        expect(deliveryResult?.delivered).toBe(true);

        const written = fs.readFileSync(path.join(outDir, "base", "win.json"), "utf-8");
        const parsed = JSON.parse(written) as {roundId: string; totalWin: number; hash: string};
        expect(parsed.roundId).toBe("lib-1");
        expect(parsed.totalWin).toBe(2);
        expect(typeof parsed.hash).toBe("string");

        const index = JSON.parse(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")) as {modes: {modeName: string; outcomeCount: number}[]};
        expect(index.modes).toEqual([expect.objectContaining({modeName: "base", outcomeCount: 2})]);
    });

    it("rejects two targets with case-colliding ids in the same registry", () => {
        const registry = new ExternalDeploymentTargetRegistry();
        registry.register(createLocalJsonExternalDeploymentTarget({id: "acme-target", outDir}));

        expect(() => registry.register(createLocalJsonExternalDeploymentTarget({id: "Acme-Target", outDir}))).toThrow();
    });

    it("fails compatibility validation before generation when multiple modes are given without declaring multi-mode support", () => {
        // The local example target *does* declare multiModeDeployment, so simulate a stricter target by
        // stripping that capability off a copy — proving compatibility runs strictly before any file exists.
        const target = {...createLocalJsonExternalDeploymentTarget({outDir}), capabilities: []};
        const modes: ExternalDeploymentModeInput[] = [
            {modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib-1"})},
            {modeName: "bonus", library: externalAdapterTestLibrary({libraryId: "lib-2"})},
        ];

        const issues = new ExternalDeploymentCompatibilityValidator().validate({target, modes});
        expect(issues.map((issue) => issue.code)).toContain("external-deployment-multi-mode-unsupported");
        expect(fs.readdirSync(outDir)).toEqual([]);
    });

    it("diagnoses a non-writable output directory as failing", async () => {
        const unwritableParent = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-externaladapter-unwritable-"));
        const nestedOutDir = path.join(unwritableParent, "does-not-exist-yet");
        fs.chmodSync(unwritableParent, 0o500);

        try {
            const target = createLocalJsonExternalDeploymentTarget({outDir: nestedOutDir});
            const report = await target.diagnostic?.diagnose();
            expect(report?.ok).toBe(false);
        } finally {
            fs.chmodSync(unwritableParent, 0o700);
            fs.rmSync(unwritableParent, {recursive: true, force: true});
        }
    });
});

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {ExternalDeploymentModeInput, ExternalDeploymentService, ExternalDeploymentTargetRegistry, createLocalJsonExternalDeploymentTarget} from "pokie";
import {externalAdapterTestLibrary} from "./ExternalAdapterTestFixtures.js";

function sha256Hex(raw: string): string {
    return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

type LocalIndex = {
    readonly modes: readonly {
        readonly modeName: string;
        readonly directory: string;
        readonly outcomeCount: number;
        readonly outcomes: readonly {readonly id: string; readonly file: string}[];
    }[];
};

describe("createLocalJsonExternalDeploymentTarget (end-to-end SDK pipeline via ExternalDeploymentService)", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-externaladapter-test-"));
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    it("registers, deploys, and delivers a single-mode deployment end to end", async () => {
        const target = createLocalJsonExternalDeploymentTarget({outDir});
        const registry = new ExternalDeploymentTargetRegistry();
        registry.register(target);
        expect(registry.get("local-json-example")).toBe(target);

        const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib"})}];
        const result = await new ExternalDeploymentService().deploy(target, modes);

        expect(result.descriptorIssues).toEqual([]);
        expect(result.compatibilityIssues).toEqual([]);
        expect(result.generation?.issues).toEqual([]);
        expect(result.artifactIssues).toEqual([]);
        expect(result.diagnostic?.ok).toBe(true);
        expect(result.delivery?.delivered).toBe(true);

        const modeDirectory = sha256Hex("base");
        const index = JSON.parse(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")) as LocalIndex;
        expect(index.modes).toHaveLength(1);
        expect(index.modes[0].modeName).toBe("base");
        expect(index.modes[0].directory).toBe(`${modeDirectory}/`);
        expect(index.modes[0].outcomeCount).toBe(2);

        // Neither raw outcome id ever appears as a literal path segment on disk — only the encoded file name in
        // "outcomes[].file" does, with the original id preserved as data in "outcomes[].id".
        const winEntry = index.modes[0].outcomes.find((entry) => entry.id === "win");
        expect(winEntry).toBeDefined();
        expect(fs.existsSync(path.join(outDir, "base", "win.json"))).toBe(false);

        const written = fs.readFileSync(path.join(outDir, modeDirectory, winEntry?.file ?? ""), "utf-8");
        const parsed = JSON.parse(written) as {roundId: string; totalWin: number; hash: string};
        expect(parsed.roundId).toBe("lib-1");
        expect(parsed.totalWin).toBe(2);
        expect(typeof parsed.hash).toBe("string");
    });

    it("does not call the generator or write anything when compatibility validation fails", async () => {
        const target = {...createLocalJsonExternalDeploymentTarget({outDir}), capabilities: []};
        const modes: ExternalDeploymentModeInput[] = [
            {modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib-1"})},
            {modeName: "bonus", library: externalAdapterTestLibrary({libraryId: "lib-2"})},
        ];

        const result = await new ExternalDeploymentService().deploy(target, modes);

        expect(result.compatibilityIssues.map((issue) => issue.code)).toContain("external-deployment-multi-mode-unsupported");
        expect(result.generation).toBeUndefined();
        expect(result.delivery).toBeUndefined();
        expect(fs.readdirSync(outDir)).toEqual([]);
    });

    it("rejects two targets with case-colliding ids in the same registry", () => {
        const registry = new ExternalDeploymentTargetRegistry();
        registry.register(createLocalJsonExternalDeploymentTarget({id: "acme-target", outDir}));
        expect(() => registry.register(createLocalJsonExternalDeploymentTarget({id: "Acme-Target", outDir}))).toThrow();
    });

    it("diagnoses a writable outDir as ok even when several directory levels are missing", async () => {
        const parent = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-externaladapter-nested-outdir-"));
        try {
            // Nothing below `parent` exists yet — the diagnostic must walk up past both missing levels
            // to find `parent` itself (the nearest existing, writable ancestor) rather than only ever
            // checking the immediate parent, which would report a false "not writable" here.
            const nestedOutDir = path.join(parent, "deployment", "local-json-example");
            const target = createLocalJsonExternalDeploymentTarget({outDir: nestedOutDir});

            const report = await target.diagnostic?.diagnose();

            expect(report?.ok).toBe(true);
        } finally {
            fs.rmSync(parent, {recursive: true, force: true});
        }
    });

    it("diagnoses a non-writable output directory as failing and skips delivery entirely", async () => {
        const unwritableParent = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-externaladapter-unwritable-"));
        const nestedOutDir = path.join(unwritableParent, "does-not-exist-yet");
        fs.chmodSync(unwritableParent, 0o500);

        try {
            const target = createLocalJsonExternalDeploymentTarget({outDir: nestedOutDir});
            const modes: ExternalDeploymentModeInput[] = [{modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib"})}];
            const result = await new ExternalDeploymentService().deploy(target, modes);

            expect(result.diagnostic?.ok).toBe(false);
            expect(result.delivery).toBeUndefined();
        } finally {
            fs.chmodSync(unwritableParent, 0o700);
            fs.rmSync(unwritableParent, {recursive: true, force: true});
        }
    });

    it("encodes an unsafe modeName/outcome id into safe deterministic paths and preserves the raw ids in index.json", async () => {
        const target = createLocalJsonExternalDeploymentTarget({outDir});
        const library = externalAdapterTestLibrary({libraryId: "unsafe-lib"});
        const unsafeLibrary = {
            ...library,
            outcomes: [{...library.outcomes[0], id: "../../etc/passwd"}, library.outcomes[1]],
        };
        const modes: ExternalDeploymentModeInput[] = [{modeName: "../escape", library: unsafeLibrary}];

        const result = await new ExternalDeploymentService().deploy(target, modes);

        expect(result.artifactIssues).toEqual([]);
        expect(result.delivery?.delivered).toBe(true);

        const modeDirectory = sha256Hex("../escape");
        expect(fs.existsSync(path.join(outDir, modeDirectory))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "..", "escape"))).toBe(false);

        const index = JSON.parse(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")) as LocalIndex;
        expect(index.modes[0].modeName).toBe("../escape");
        const unsafeEntry = index.modes[0].outcomes.find((entry) => entry.id === "../../etc/passwd");
        expect(unsafeEntry).toBeDefined();
        expect(unsafeEntry?.file).toMatch(/^[0-9a-f]{64}\.json$/);
    });
});

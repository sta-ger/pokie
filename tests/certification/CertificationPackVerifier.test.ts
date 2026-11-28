import fs from "fs";
import os from "os";
import path from "path";
import {CertificationPackBuilder, CertificationPackVerifier, DEFAULT_CERTIFICATION_PACK_TEMPLATE} from "@fromstan/pokie";
import {ensureAtomicDirectoryExchange} from "../testUtils/atomicDirectoryExchange.js";
import {buildSourceOutcomeLibraryFolder, CERTIFICATION_TEST_POKIE_VERSION} from "./CertificationPackTestFixtures.js";

ensureAtomicDirectoryExchange();

describe("CertificationPackVerifier template authority", () => {
    let tmpRoot: string;
    let libraryDir: string;
    let certDir: string;

    beforeEach(async () => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cert-verifier-template-"));
        libraryDir = path.join(tmpRoot, "library");
        certDir = path.join(tmpRoot, "certification");
        await buildSourceOutcomeLibraryFolder(libraryDir, ["base"]);
        const built = await new CertificationPackBuilder(CERTIFICATION_TEST_POKIE_VERSION).buildFromBundle(
            libraryDir,
            [{modeName: "base", seed: "template-authority", sampleCount: 1}],
            certDir,
        );
        expect(built.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    it("verifies the default-template pack when no template is supplied", async () => {
        const issues = await new CertificationPackVerifier().verify(certDir, {sourceLibraryDir: libraryDir});
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("does not silently ignore a malformed explicitly supplied template", async () => {
        const templateFile = path.join(tmpRoot, "bad-template.json");
        fs.writeFileSync(templateFile, "{ not json");
        const issues = await new CertificationPackVerifier().verify(certDir, {sourceLibraryDir: libraryDir, templateFile});
        expect(issues).toEqual(expect.arrayContaining([
            expect.objectContaining({severity: "error", code: "certification-pack-authority-mismatch", message: expect.stringMatching(/json/i)}),
        ]));
    });

    it("rejects a different valid template for a pack rendered with the default template", async () => {
        const templateFile = path.join(tmpRoot, "different-template.json");
        fs.writeFileSync(templateFile, JSON.stringify({...DEFAULT_CERTIFICATION_PACK_TEMPLATE, title: "A different evidence title"}));
        const issues = await new CertificationPackVerifier().verify(certDir, {sourceLibraryDir: libraryDir, templateFile});
        expect(issues).toEqual(expect.arrayContaining([
            expect.objectContaining({severity: "error", code: "certification-pack-authority-mismatch", message: expect.stringContaining("differs from the default template")}),
        ]));
    });
});

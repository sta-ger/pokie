import fs from "fs";
import os from "os";
import path from "path";
import {OutcomeLibraryBundleValidating, ValidationIssue} from "pokie";
import {StudioCertificationService} from "../../../../cli/studio/certification/StudioCertificationService.js";
import {buildSourceOutcomeLibraryBundle, CERTIFICATION_TEST_POKIE_VERSION} from "../../../certification/CertificationEvidenceBundleTestFixtures.js";

class FakeBundleValidator implements OutcomeLibraryBundleValidating {
    private readonly issues: ValidationIssue[];

    constructor(issues: ValidationIssue[]) {
        this.issues = issues;
    }

    public validate(): Promise<ValidationIssue[]> {
        return Promise.resolve(this.issues);
    }
}

describe("StudioCertificationService", () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "studio-cert-service-"));
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    describe("validateSourceBundle", () => {
        it("splits deep-validation issues by severity for a real source bundle", async () => {
            await buildSourceOutcomeLibraryBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const service = new StudioCertificationService(CERTIFICATION_TEST_POKIE_VERSION);

            const view = await service.validateSourceBundle(tmpRoot, "bundle");

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.errors).toEqual([]);
            expect(view.warnings).toEqual([]);
        });

        it("surfaces deep-validation errors/warnings reported by the validator", async () => {
            await buildSourceOutcomeLibraryBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const validator = new FakeBundleValidator([
                {code: "some-warning", severity: "warning", message: "a warning"},
                {code: "some-error", severity: "error", message: "an error"},
            ]);
            const service = new StudioCertificationService(CERTIFICATION_TEST_POKIE_VERSION, undefined, validator);

            const view = await service.validateSourceBundle(tmpRoot, "bundle");

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.errors).toHaveLength(1);
            expect(view.warnings).toHaveLength(1);
        });

        it("reports load-error for a bundle path that resolves outside the project root", async () => {
            const service = new StudioCertificationService(CERTIFICATION_TEST_POKIE_VERSION);

            const view = await service.validateSourceBundle(tmpRoot, "../outside");

            expect(view.status).toBe("load-error");
            if (view.status !== "load-error") throw new Error("expected load-error");
            expect(view.error).toContain("outside the project root");
        });

        it("reports a validation error (never a thrown/load-error) when the bundle directory can't be read", async () => {
            // OutcomeLibraryBundleValidator never throws on a missing directory -- it reports the
            // problem as its own error-severity ValidationIssue, the same way every other bundle
            // validation call in this codebase behaves.
            const service = new StudioCertificationService(CERTIFICATION_TEST_POKIE_VERSION);

            const view = await service.validateSourceBundle(tmpRoot, "does-not-exist");

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.errors.length).toBeGreaterThan(0);
        });
    });

    describe("build", () => {
        it("builds a certification bundle from a real source bundle and returns its manifest/files", async () => {
            await buildSourceOutcomeLibraryBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const service = new StudioCertificationService(CERTIFICATION_TEST_POKIE_VERSION);

            const view = await service.build(tmpRoot, "bundle", [{modeName: "base", seed: "cert-seed-1", sampleCount: 5}], "certification");

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.manifest.modes).toHaveLength(1);
            expect(view.manifest.modes[0].modeName).toBe("base");
            expect(view.manifest.modes[0].sampleCount).toBe(5);
            expect(view.manifest.evidenceContentHash).toMatch(/^sha256:/);
            expect(view.files.length).toBeGreaterThan(0);
            expect(fs.existsSync(path.join(tmpRoot, "certification", "manifest.json"))).toBe(true);
        });

        it("returns an error view (no manifest) when a requested mode isn't in the source bundle", async () => {
            await buildSourceOutcomeLibraryBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const service = new StudioCertificationService(CERTIFICATION_TEST_POKIE_VERSION);

            const view = await service.build(tmpRoot, "bundle", [{modeName: "bonus", seed: "cert-seed-1", sampleCount: 5}], "certification");

            expect(view.status).toBe("error");
            if (view.status !== "error") throw new Error("expected error");
            expect(view.errors.length).toBeGreaterThan(0);
        });

        it("reports load-error for a bundle path that resolves outside the project root", async () => {
            const service = new StudioCertificationService(CERTIFICATION_TEST_POKIE_VERSION);

            const view = await service.build(tmpRoot, "../outside", [{modeName: "base", seed: "s", sampleCount: 1}], "certification");

            expect(view.status).toBe("load-error");
        });

        it("reports load-error for an outDir that resolves outside the project root", async () => {
            await buildSourceOutcomeLibraryBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const service = new StudioCertificationService(CERTIFICATION_TEST_POKIE_VERSION);

            const view = await service.build(tmpRoot, "bundle", [{modeName: "base", seed: "s", sampleCount: 1}], "../outside-out");

            expect(view.status).toBe("load-error");
        });

        // A not-yet-existing outDir must not be exempted from the symlink-escape check just because its
        // exact leaf isn't there yet: an existing ancestor directory somewhere inside the project that is
        // itself a symlink pointing outside it, with further not-yet-existing path components appended
        // past that point, escapes the project root just as surely as a direct symlink would -- and would
        // otherwise let the builder actually write the certification bundle outside the project.
        it("reports load-error, and never writes anything, for a nested outDir escaping through a symlinked ancestor", async () => {
            await buildSourceOutcomeLibraryBundle(path.join(tmpRoot, "bundle"), ["base"]);
            const outside = fs.mkdtempSync(path.join(os.tmpdir(), "studio-cert-service-outside-"));
            try {
                fs.symlinkSync(outside, path.join(tmpRoot, "evil"));
                const service = new StudioCertificationService(CERTIFICATION_TEST_POKIE_VERSION);

                const view = await service.build(tmpRoot, "bundle", [{modeName: "base", seed: "s", sampleCount: 1}], "evil/nested/certification");

                expect(view.status).toBe("load-error");
                if (view.status !== "load-error") throw new Error("expected load-error");
                expect(view.error).toContain("resolves, through a symlink, outside the project root");
                expect(fs.readdirSync(outside)).toEqual([]);
            } finally {
                fs.rmSync(outside, {recursive: true, force: true});
            }
        });
    });
});

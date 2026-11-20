import {
    ExternalExportModeInput,
    ExternalExportProjectedModeInput,
    ExternalExportService,
    ExternalExportTarget,
    ExternalRoundProjector,
    RoundRecord,
} from "@fromstan/pokie";
import {externalExportTestLibrary} from "./ExternalExportTestFixtures.js";

class MarkerRoundProjector implements ExternalRoundProjector {
    public project(_file: RoundRecord): Record<string, boolean> {
        return {marker: true};
    }
}

function compatibleModes(): ExternalExportModeInput[] {
    return [{modeName: "base", library: externalExportTestLibrary({libraryId: "lib"})}];
}

function baseTarget(overrides: Partial<ExternalExportTarget> = {}): ExternalExportTarget {
    return {
        id: "acme-rgs",
        version: "1.0.0",
        requirements: {},
        capabilities: [],
        roundProjector: new MarkerRoundProjector(),
        fileGenerator: {generate: () => ({files: [{relativePath: "a.json", content: "{}"}], issues: []})},
        ...overrides,
    };
}

describe("ExternalExportService", () => {
    it("does not run compatibility validation, call the generator, or ever deliver when descriptor validation fails", async () => {
        const extraCompatibilityValidate = jest.fn(() => []);
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({fileGenerator: {} as ExternalExportTarget["fileGenerator"], runtimeConnector: {deliver}});

        const service = new ExternalExportService(undefined, {validate: extraCompatibilityValidate});
        const result = await service.deploy(target, compatibleModes());

        expect(result.descriptorIssues.map((issue) => issue.code)).toContain("external-deployment-target-file-generator-invalid");
        expect(result.compatibilityIssues).toEqual([]);
        expect(result.projectionIssues).toEqual([]);
        expect(result.generation).toBeUndefined();
        expect(extraCompatibilityValidate).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });

    it("does not project, call the generator, or ever deliver when compatibility validation reports an error", async () => {
        const projector = {project: jest.fn(() => ({marker: true}))};
        const generate = jest.fn(() => ({files: [], issues: []}));
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            requirements: {symbolAlphabet: "numeric"},
            roundProjector: projector,
            fileGenerator: {generate},
            runtimeConnector: {deliver},
        });

        const result = await new ExternalExportService().deploy(target, compatibleModes());

        expect(result.compatibilityIssues.map((issue) => issue.code)).toContain("external-deployment-symbol-alphabet-invalid");
        expect(result.projectionIssues).toEqual([]);
        expect(result.generation).toBeUndefined();
        expect(projector.project).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });

    describe("projection is the service's own job, not the generator's", () => {
        it("projects every outcome through target.roundProjector and hands the generator only the projected result", async () => {
            const generate = jest.fn((_modes: readonly ExternalExportProjectedModeInput[]) => ({files: [], issues: []}));
            const target = baseTarget({roundProjector: new MarkerRoundProjector(), fileGenerator: {generate}});
            const modes = compatibleModes();

            await new ExternalExportService().deploy(target, modes);

            expect(generate).toHaveBeenCalledTimes(1);
            const [projectedModes] = generate.mock.calls[0];
            expect(projectedModes).toHaveLength(1);
            expect(projectedModes[0].modeName).toBe("base");
            expect(projectedModes[0].libraryId).toBe("lib");
            expect(typeof projectedModes[0].libraryHash).toBe("string");
            // Exactly {id, weight, projected} per outcome — nothing else (no RoundRecord, no projector
            // reference, no library) ever reaches the generator.
            expect(projectedModes[0].outcomes).toEqual([
                {id: "loss", weight: 9, projected: {marker: true}},
                {id: "win", weight: 1, projected: {marker: true}},
            ]);
        });

        it("reflects the specific target's own projector output — a different target's projector produces different generator input", async () => {
            class DoublingProjector implements ExternalRoundProjector {
                public project(file: RoundRecord): Record<string, number> {
                    return {totalWinDoubled: file.totalWin * 2};
                }
            }
            const generate = jest.fn((_modes: readonly ExternalExportProjectedModeInput[]) => ({files: [], issues: []}));
            const target = baseTarget({roundProjector: new DoublingProjector(), fileGenerator: {generate}});

            await new ExternalExportService().deploy(target, compatibleModes());

            const [projectedModes] = generate.mock.calls[0];
            const winOutcome = projectedModes[0].outcomes.find((outcome) => outcome.id === "win");
            expect(winOutcome?.projected).toEqual({totalWinDoubled: 4});
        });

        it("converts a throwing roundProjector into a projection error and never reaches generation or delivery", async () => {
            const generate = jest.fn(() => ({files: [], issues: []}));
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const throwingProjector: ExternalRoundProjector = {
                project: () => {
                    throw new Error("projector exploded");
                },
            };
            const target = baseTarget({roundProjector: throwingProjector, fileGenerator: {generate}, runtimeConnector: {deliver}});

            const result = await new ExternalExportService().deploy(target, compatibleModes());

            expect(result.projectionIssues.map((issue) => issue.code)).toContain("external-deployment-projection-failed");
            expect(result.generation).toBeUndefined();
            expect(generate).not.toHaveBeenCalled();
            expect(deliver).not.toHaveBeenCalled();
        });

        it("converts non-JSON-safe projected output into a projection error", async () => {
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const unsafeProjector: ExternalRoundProjector = {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                project: () => ({bad: NaN}) as any,
            };
            const target = baseTarget({roundProjector: unsafeProjector, runtimeConnector: {deliver}});

            const result = await new ExternalExportService().deploy(target, compatibleModes());

            expect(result.projectionIssues.map((issue) => issue.code)).toContain("external-deployment-projection-not-json-safe");
            expect(result.generation).toBeUndefined();
            expect(deliver).not.toHaveBeenCalled();
        });
    });

    it("converts a throwing generator into a generation-level error diagnostic instead of rejecting deploy()", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            fileGenerator: {
                generate: () => {
                    throw new Error("generator exploded");
                },
            },
            runtimeConnector: {deliver},
        });

        const result = await new ExternalExportService().deploy(target, compatibleModes());

        expect(result.generation?.issues.map((issue) => issue.code)).toEqual(["external-deployment-generator-threw"]);
        expect(result.fileIssues).toEqual([]);
        expect(deliver).not.toHaveBeenCalled();
    });

    it("does not call the file generator's optional collaborators when generation itself reports an error", async () => {
        const validate = jest.fn(() => []);
        const diagnose = jest.fn(() => Promise.resolve({ok: true, checks: []}));
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            fileGenerator: {generate: () => ({files: [], issues: [{code: "generator-exploded", severity: "error", message: "boom"}]})},
            fileValidator: {validate},
            diagnostic: {diagnose},
            runtimeConnector: {deliver},
        });

        const result = await new ExternalExportService().deploy(target, compatibleModes());

        expect(result.generation?.issues.map((issue) => issue.code)).toEqual(["generator-exploded"]);
        expect(result.fileIssues).toEqual([]);
        expect(validate).not.toHaveBeenCalled();
        expect(diagnose).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });

    describe("generation result shape hardening — the generator's return value is treated as unknown", () => {
        function malformedGenerationTarget(rawResult: unknown): {target: ExternalExportTarget; spies: ReturnType<typeof malformedGenerationSpies>} {
            const spies = malformedGenerationSpies();
            const target = baseTarget({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fileGenerator: {generate: (() => rawResult) as any},
                fileValidator: {validate: spies.targetValidate},
                diagnostic: {diagnose: spies.diagnose},
                runtimeConnector: {deliver: spies.deliver},
            });
            return {target, spies};
        }

        function malformedGenerationSpies() {
            return {
                targetValidate: jest.fn(() => []),
                diagnose: jest.fn(() => Promise.resolve({ok: true, checks: []})),
                deliver: jest.fn(() => Promise.resolve({delivered: true})),
            };
        }

        async function expectStructuredRejectionFor(rawResult: unknown, expectedCode: string): Promise<void> {
            const {target, spies} = malformedGenerationTarget(rawResult);
            const extraFileValidate = jest.fn(() => []);
            const service = new ExternalExportService(undefined, undefined, {validate: extraFileValidate});

            // deploy() never rejects, however malformed the generator's return value is — it always resolves to
            // a structured ExternalExportResult instead.
            const resultPromise = service.deploy(target, compatibleModes());
            await expect(resultPromise).resolves.toBeDefined();
            const result = await resultPromise;

            expect(result.fileIssues.map((issue) => issue.code)).toContain(expectedCode);
            expect(result.generation).toBeUndefined(); // never exposed as a typed "valid" generation
            expect(spies.targetValidate).not.toHaveBeenCalled();
            expect(extraFileValidate).not.toHaveBeenCalled();
            expect(spies.diagnose).not.toHaveBeenCalled();
            expect(spies.deliver).not.toHaveBeenCalled();
        }

        it("handles a generator that returns undefined", async () => {
            await expectStructuredRejectionFor(undefined, "external-file-generation-result-invalid");
        });

        it("handles a generator that returns null", async () => {
            await expectStructuredRejectionFor(null, "external-file-generation-result-invalid");
        });

        it("handles a generator result with issues missing entirely", async () => {
            await expectStructuredRejectionFor({files: []}, "external-file-generation-result-invalid");
        });

        it("handles a generator result whose issues is not an array", async () => {
            await expectStructuredRejectionFor({files: [], issues: "nope"}, "external-file-generation-result-invalid");
        });

        it("handles a generator result whose files is not an array", async () => {
            await expectStructuredRejectionFor({files: "not-an-array", issues: []}, "external-file-generation-result-invalid");
        });

        it("handles a generator result with a non-string/non-Buffer file content", async () => {
            await expectStructuredRejectionFor({files: [{relativePath: "a.json", content: 12345}], issues: []}, "external-file-content-type-invalid");
        });

        it("handles a generator that returns a bare string instead of an object", async () => {
            await expectStructuredRejectionFor("oops", "external-file-generation-result-invalid");
        });
    });

    it("StandardExternalFileValidator's own findings are never hidden by a permissive target validator — which is never even called once Standard fails", async () => {
        const permissive = jest.fn(() => []); // always reports nothing, however bad the files are
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            fileGenerator: {
                generate: () => ({
                    files: [
                        {relativePath: "same.json", content: "{}"},
                        {relativePath: "same.json", content: "{}"},
                    ],
                    issues: [],
                }),
            },
            fileValidator: {validate: permissive},
            runtimeConnector: {deliver},
        });

        const result = await new ExternalExportService().deploy(target, compatibleModes());

        expect(result.fileIssues.map((issue) => issue.code)).toContain("external-file-duplicate-path");
        // target.fileValidator only ever runs on files Standard has already confirmed well-formed —
        // Standard's own duplicate-path finding here means it's never reached, permissive or not.
        expect(permissive).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });

    it("combines the target's own additive issues with the extra file validator's, on top of a clean Standard pass, never one replacing the other", async () => {
        const target = baseTarget({
            fileValidator: {validate: () => [{code: "vendor-specific-check-failed", severity: "error", message: "vendor rule violated"}]},
        });
        const service = new ExternalExportService(undefined, undefined, {
            validate: () => [{code: "extra-vendor-check-failed", severity: "error", message: "extra vendor rule violated"}],
        });

        const result = await service.deploy(target, compatibleModes());
        const codes = result.fileIssues.map((issue) => issue.code);

        expect(codes).toContain("vendor-specific-check-failed");
        expect(codes).toContain("extra-vendor-check-failed");
    });

    it("converts a throwing target.fileValidator into an error diagnostic and never delivers", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            fileValidator: {
                validate: () => {
                    throw new Error("validator exploded");
                },
            },
            runtimeConnector: {deliver},
        });

        const result = await new ExternalExportService().deploy(target, compatibleModes());

        expect(result.fileIssues.map((issue) => issue.code)).toContain("external-deployment-target-file-validator-threw");
        expect(deliver).not.toHaveBeenCalled();
    });

    describe("mandatory built-in validators can never be bypassed by an injected 'extra' validator", () => {
        it("still reports a broken descriptor, and never delivers, even when the extra descriptor validator is permissive", async () => {
            const permissiveExtra = {validate: jest.fn(() => [])};
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const target = baseTarget({id: "", runtimeConnector: {deliver}});
            const service = new ExternalExportService(permissiveExtra);

            const result = await service.deploy(target, compatibleModes());

            expect(permissiveExtra.validate).toHaveBeenCalled();
            expect(result.descriptorIssues.map((issue) => issue.code)).toContain("external-deployment-target-id-invalid");
            expect(deliver).not.toHaveBeenCalled();
        });

        it("still reports incompatible content, and never delivers, even when the extra compatibility validator is permissive", async () => {
            const permissiveExtra = {validate: jest.fn(() => [])};
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const target = baseTarget({requirements: {symbolAlphabet: "numeric"}, runtimeConnector: {deliver}});
            const service = new ExternalExportService(undefined, permissiveExtra);

            const result = await service.deploy(target, compatibleModes());

            expect(permissiveExtra.validate).toHaveBeenCalled();
            expect(result.compatibilityIssues.map((issue) => issue.code)).toContain("external-deployment-symbol-alphabet-invalid");
            expect(deliver).not.toHaveBeenCalled();
        });

        it("still reports a Standard-level file problem even with a permissive extra validator configured — which is never reached at all", async () => {
            const permissiveExtra = {validate: jest.fn(() => [])};
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const target = baseTarget({
                fileGenerator: {
                    generate: () => ({
                        files: [
                            {relativePath: "same.json", content: "{}"},
                            {relativePath: "same.json", content: "{}"},
                        ],
                        issues: [],
                    }),
                },
                runtimeConnector: {deliver},
            });
            const service = new ExternalExportService(undefined, undefined, permissiveExtra);

            const result = await service.deploy(target, compatibleModes());

            expect(result.fileIssues.map((issue) => issue.code)).toContain("external-file-duplicate-path");
            // The extra validator has no way to hide this — it isn't even called, since it only ever runs on
            // files Standard has already confirmed well-formed.
            expect(permissiveExtra.validate).not.toHaveBeenCalled();
            expect(deliver).not.toHaveBeenCalled();
        });

        it("adds the extra file validator's own issues on top of the built-in ones, additively", async () => {
            const extra = {validate: jest.fn(() => [{code: "vendor-check-failed", severity: "error" as const, message: "vendor rule violated"}])};
            const service = new ExternalExportService(undefined, undefined, extra);

            const result = await service.deploy(baseTarget(), compatibleModes());

            expect(result.fileIssues.map((issue) => issue.code)).toContain("vendor-check-failed");
        });

        it("converts a throwing extra descriptor validator into an error diagnostic rather than letting it crash deploy(), and never delivers", async () => {
            const throwingExtra = {
                validate: () => {
                    throw new Error("extra validator exploded");
                },
            };
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const service = new ExternalExportService(throwingExtra);

            const result = await service.deploy(baseTarget({runtimeConnector: {deliver}}), compatibleModes());

            expect(result.descriptorIssues.map((issue) => issue.code)).toContain("external-deployment-extra-descriptor-validator-threw");
            expect(deliver).not.toHaveBeenCalled();
        });

        it("converts a throwing extra compatibility validator into an error diagnostic, and never delivers", async () => {
            const throwingExtra = {
                validate: () => {
                    throw new Error("extra validator exploded");
                },
            };
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const service = new ExternalExportService(undefined, throwingExtra);

            const result = await service.deploy(baseTarget({runtimeConnector: {deliver}}), compatibleModes());

            expect(result.compatibilityIssues.map((issue) => issue.code)).toContain("external-deployment-extra-compatibility-validator-threw");
            expect(deliver).not.toHaveBeenCalled();
        });

        it("converts a throwing extra file validator into an error diagnostic, and never delivers", async () => {
            const throwingExtra = {
                validate: () => {
                    throw new Error("extra validator exploded");
                },
            };
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const service = new ExternalExportService(undefined, undefined, throwingExtra);

            const result = await service.deploy(baseTarget({runtimeConnector: {deliver}}), compatibleModes());

            expect(result.fileIssues.map((issue) => issue.code)).toContain("external-deployment-extra-file-validator-threw");
            expect(deliver).not.toHaveBeenCalled();
        });
    });

    it("skips delivery when the diagnostic reports not-ok", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            diagnostic: {diagnose: () => Promise.resolve({ok: false, checks: [{name: "endpointReachable", ok: false, message: "unreachable"}]})},
            runtimeConnector: {deliver},
        });

        const result = await new ExternalExportService().deploy(target, compatibleModes());

        expect(result.diagnostic?.ok).toBe(false);
        expect(result.delivery).toBeUndefined();
        expect(deliver).not.toHaveBeenCalled();
    });

    it("runs the full pipeline through to delivery when every stage succeeds", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true, details: {published: true}}));
        const target = baseTarget({
            diagnostic: {diagnose: () => Promise.resolve({ok: true, checks: []})},
            runtimeConnector: {deliver},
        });

        const result = await new ExternalExportService().deploy(target, compatibleModes());

        expect(result.descriptorIssues).toEqual([]);
        expect(result.compatibilityIssues).toEqual([]);
        expect(result.projectionIssues).toEqual([]);
        expect(result.fileIssues).toEqual([]);
        expect(result.diagnostic?.ok).toBe(true);
        expect(result.delivery?.delivered).toBe(true);
        expect(deliver).toHaveBeenCalledTimes(1);
    });

    it("skips diagnostic and delivery entirely when the target declares neither", async () => {
        const target = baseTarget();

        const result = await new ExternalExportService().deploy(target, compatibleModes());

        expect(result.fileIssues).toEqual([]);
        expect(result.diagnostic).toBeUndefined();
        expect(result.delivery).toBeUndefined();
    });
});

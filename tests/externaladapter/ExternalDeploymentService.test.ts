import {
    ExternalDeploymentModeInput,
    ExternalDeploymentProjectedModeInput,
    ExternalDeploymentService,
    ExternalDeploymentTarget,
    ExternalRoundProjector,
    RoundArtifact,
} from "pokie";
import {externalAdapterTestLibrary} from "./ExternalAdapterTestFixtures.js";

class MarkerRoundProjector implements ExternalRoundProjector {
    public project(_artifact: RoundArtifact): Record<string, boolean> {
        return {marker: true};
    }
}

function compatibleModes(): ExternalDeploymentModeInput[] {
    return [{modeName: "base", library: externalAdapterTestLibrary({libraryId: "lib"})}];
}

function baseTarget(overrides: Partial<ExternalDeploymentTarget> = {}): ExternalDeploymentTarget {
    return {
        id: "acme-rgs",
        version: "1.0.0",
        requirements: {},
        capabilities: [],
        roundProjector: new MarkerRoundProjector(),
        artifactGenerator: {generate: () => ({artifacts: [{relativePath: "a.json", content: "{}"}], issues: []})},
        ...overrides,
    };
}

describe("ExternalDeploymentService", () => {
    it("does not run compatibility validation, call the generator, or ever deliver when descriptor validation fails", async () => {
        const extraCompatibilityValidate = jest.fn(() => []);
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({artifactGenerator: {} as ExternalDeploymentTarget["artifactGenerator"], runtimeAdapter: {deliver}});

        const service = new ExternalDeploymentService(undefined, {validate: extraCompatibilityValidate});
        const result = await service.deploy(target, compatibleModes());

        expect(result.descriptorIssues.map((issue) => issue.code)).toContain("external-deployment-target-artifact-generator-invalid");
        expect(result.compatibilityIssues).toEqual([]);
        expect(result.projectionIssues).toEqual([]);
        expect(result.generation).toBeUndefined();
        expect(extraCompatibilityValidate).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });

    it("does not project, call the generator, or ever deliver when compatibility validation reports an error", async () => {
        const projector = {project: jest.fn(() => ({marker: true}))};
        const generate = jest.fn(() => ({artifacts: [], issues: []}));
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            requirements: {symbolAlphabet: "numeric"},
            roundProjector: projector,
            artifactGenerator: {generate},
            runtimeAdapter: {deliver},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(result.compatibilityIssues.map((issue) => issue.code)).toContain("external-deployment-symbol-alphabet-invalid");
        expect(result.projectionIssues).toEqual([]);
        expect(result.generation).toBeUndefined();
        expect(projector.project).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });

    describe("projection is the service's own job, not the generator's", () => {
        it("projects every outcome through target.roundProjector and hands the generator only the projected result", async () => {
            const generate = jest.fn((_modes: readonly ExternalDeploymentProjectedModeInput[]) => ({artifacts: [], issues: []}));
            const target = baseTarget({roundProjector: new MarkerRoundProjector(), artifactGenerator: {generate}});
            const modes = compatibleModes();

            await new ExternalDeploymentService().deploy(target, modes);

            expect(generate).toHaveBeenCalledTimes(1);
            const [projectedModes] = generate.mock.calls[0];
            expect(projectedModes).toHaveLength(1);
            expect(projectedModes[0].modeName).toBe("base");
            expect(projectedModes[0].libraryId).toBe("lib");
            expect(typeof projectedModes[0].libraryHash).toBe("string");
            // Exactly {id, weight, projected} per outcome — nothing else (no RoundArtifact, no projector
            // reference, no library) ever reaches the generator.
            expect(projectedModes[0].outcomes).toEqual([
                {id: "loss", weight: 9, projected: {marker: true}},
                {id: "win", weight: 1, projected: {marker: true}},
            ]);
        });

        it("reflects the specific target's own projector output — a different target's projector produces different generator input", async () => {
            class DoublingProjector implements ExternalRoundProjector {
                public project(artifact: RoundArtifact): Record<string, number> {
                    return {totalWinDoubled: artifact.totalWin * 2};
                }
            }
            const generate = jest.fn((_modes: readonly ExternalDeploymentProjectedModeInput[]) => ({artifacts: [], issues: []}));
            const target = baseTarget({roundProjector: new DoublingProjector(), artifactGenerator: {generate}});

            await new ExternalDeploymentService().deploy(target, compatibleModes());

            const [projectedModes] = generate.mock.calls[0];
            const winOutcome = projectedModes[0].outcomes.find((outcome) => outcome.id === "win");
            expect(winOutcome?.projected).toEqual({totalWinDoubled: 4});
        });

        it("converts a throwing roundProjector into a projection error and never reaches generation or delivery", async () => {
            const generate = jest.fn(() => ({artifacts: [], issues: []}));
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const throwingProjector: ExternalRoundProjector = {
                project: () => {
                    throw new Error("projector exploded");
                },
            };
            const target = baseTarget({roundProjector: throwingProjector, artifactGenerator: {generate}, runtimeAdapter: {deliver}});

            const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

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
            const target = baseTarget({roundProjector: unsafeProjector, runtimeAdapter: {deliver}});

            const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

            expect(result.projectionIssues.map((issue) => issue.code)).toContain("external-deployment-projection-not-json-safe");
            expect(result.generation).toBeUndefined();
            expect(deliver).not.toHaveBeenCalled();
        });
    });

    it("converts a throwing generator into a generation-level error diagnostic instead of rejecting deploy()", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            artifactGenerator: {
                generate: () => {
                    throw new Error("generator exploded");
                },
            },
            runtimeAdapter: {deliver},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(result.generation?.issues.map((issue) => issue.code)).toEqual(["external-deployment-generator-threw"]);
        expect(result.artifactIssues).toEqual([]);
        expect(deliver).not.toHaveBeenCalled();
    });

    it("does not call the artifact generator's optional collaborators when generation itself reports an error", async () => {
        const validate = jest.fn(() => []);
        const diagnose = jest.fn(() => Promise.resolve({ok: true, checks: []}));
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            artifactGenerator: {generate: () => ({artifacts: [], issues: [{code: "generator-exploded", severity: "error", message: "boom"}]})},
            artifactValidator: {validate},
            diagnostic: {diagnose},
            runtimeAdapter: {deliver},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(result.generation?.issues.map((issue) => issue.code)).toEqual(["generator-exploded"]);
        expect(result.artifactIssues).toEqual([]);
        expect(validate).not.toHaveBeenCalled();
        expect(diagnose).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });

    describe("generation result shape hardening", () => {
        it("reports a structural error and never delivers when the generator returns a malformed result", async () => {
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const target = baseTarget({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                artifactGenerator: {generate: (() => ({artifacts: "not-an-array", issues: []})) as any},
                runtimeAdapter: {deliver},
            });

            const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

            expect(result.artifactIssues.map((issue) => issue.code)).toContain("external-artifact-generation-result-invalid");
            expect(deliver).not.toHaveBeenCalled();
        });

        it("reports a structural error and never delivers when an artifact's content is neither a string nor a Buffer", async () => {
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const target = baseTarget({
                artifactGenerator: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    generate: (() => ({artifacts: [{relativePath: "a.json", content: 12345}], issues: []})) as any,
                },
                runtimeAdapter: {deliver},
            });

            const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

            expect(result.artifactIssues.map((issue) => issue.code)).toContain("external-artifact-content-type-invalid");
            expect(deliver).not.toHaveBeenCalled();
        });
    });

    it("always runs StandardExternalArtifactValidator even when the target's own validator is permissive", async () => {
        const permissive = jest.fn(() => []); // always reports nothing, however bad the artifacts are
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            artifactGenerator: {
                generate: () => ({
                    artifacts: [
                        {relativePath: "same.json", content: "{}"},
                        {relativePath: "same.json", content: "{}"},
                    ],
                    issues: [],
                }),
            },
            artifactValidator: {validate: permissive},
            runtimeAdapter: {deliver},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(permissive).toHaveBeenCalled();
        expect(result.artifactIssues.map((issue) => issue.code)).toContain("external-artifact-duplicate-path");
        expect(deliver).not.toHaveBeenCalled();
    });

    it("combines StandardExternalArtifactValidator issues with the target's own additive issues, never one replacing the other", async () => {
        const target = baseTarget({
            artifactGenerator: {
                generate: () => ({
                    artifacts: [
                        {relativePath: "same.json", content: "{}"},
                        {relativePath: "same.json", content: "{}"},
                    ],
                    issues: [],
                }),
            },
            artifactValidator: {validate: () => [{code: "vendor-specific-check-failed", severity: "error", message: "vendor rule violated"}]},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());
        const codes = result.artifactIssues.map((issue) => issue.code);

        expect(codes).toContain("external-artifact-duplicate-path");
        expect(codes).toContain("vendor-specific-check-failed");
    });

    it("converts a throwing target.artifactValidator into an error diagnostic and never delivers", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            artifactValidator: {
                validate: () => {
                    throw new Error("validator exploded");
                },
            },
            runtimeAdapter: {deliver},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(result.artifactIssues.map((issue) => issue.code)).toContain("external-deployment-target-artifact-validator-threw");
        expect(deliver).not.toHaveBeenCalled();
    });

    describe("mandatory built-in validators can never be bypassed by an injected 'extra' validator", () => {
        it("still reports a broken descriptor, and never delivers, even when the extra descriptor validator is permissive", async () => {
            const permissiveExtra = {validate: jest.fn(() => [])};
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const target = baseTarget({id: "", runtimeAdapter: {deliver}});
            const service = new ExternalDeploymentService(permissiveExtra);

            const result = await service.deploy(target, compatibleModes());

            expect(permissiveExtra.validate).toHaveBeenCalled();
            expect(result.descriptorIssues.map((issue) => issue.code)).toContain("external-deployment-target-id-invalid");
            expect(deliver).not.toHaveBeenCalled();
        });

        it("still reports incompatible content, and never delivers, even when the extra compatibility validator is permissive", async () => {
            const permissiveExtra = {validate: jest.fn(() => [])};
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const target = baseTarget({requirements: {symbolAlphabet: "numeric"}, runtimeAdapter: {deliver}});
            const service = new ExternalDeploymentService(undefined, permissiveExtra);

            const result = await service.deploy(target, compatibleModes());

            expect(permissiveExtra.validate).toHaveBeenCalled();
            expect(result.compatibilityIssues.map((issue) => issue.code)).toContain("external-deployment-symbol-alphabet-invalid");
            expect(deliver).not.toHaveBeenCalled();
        });

        it("still reports malformed artifacts even when the extra artifact validator is permissive", async () => {
            const permissiveExtra = {validate: jest.fn(() => [])};
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const target = baseTarget({
                artifactGenerator: {
                    generate: () => ({
                        artifacts: [
                            {relativePath: "same.json", content: "{}"},
                            {relativePath: "same.json", content: "{}"},
                        ],
                        issues: [],
                    }),
                },
                runtimeAdapter: {deliver},
            });
            const service = new ExternalDeploymentService(undefined, undefined, permissiveExtra);

            const result = await service.deploy(target, compatibleModes());

            expect(permissiveExtra.validate).toHaveBeenCalled();
            expect(result.artifactIssues.map((issue) => issue.code)).toContain("external-artifact-duplicate-path");
            expect(deliver).not.toHaveBeenCalled();
        });

        it("adds the extra artifact validator's own issues on top of the built-in ones, additively", async () => {
            const extra = {validate: jest.fn(() => [{code: "vendor-check-failed", severity: "error" as const, message: "vendor rule violated"}])};
            const service = new ExternalDeploymentService(undefined, undefined, extra);

            const result = await service.deploy(baseTarget(), compatibleModes());

            expect(result.artifactIssues.map((issue) => issue.code)).toContain("vendor-check-failed");
        });

        it("converts a throwing extra descriptor validator into an error diagnostic rather than letting it crash deploy(), and never delivers", async () => {
            const throwingExtra = {
                validate: () => {
                    throw new Error("extra validator exploded");
                },
            };
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const service = new ExternalDeploymentService(throwingExtra);

            const result = await service.deploy(baseTarget({runtimeAdapter: {deliver}}), compatibleModes());

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
            const service = new ExternalDeploymentService(undefined, throwingExtra);

            const result = await service.deploy(baseTarget({runtimeAdapter: {deliver}}), compatibleModes());

            expect(result.compatibilityIssues.map((issue) => issue.code)).toContain("external-deployment-extra-compatibility-validator-threw");
            expect(deliver).not.toHaveBeenCalled();
        });

        it("converts a throwing extra artifact validator into an error diagnostic, and never delivers", async () => {
            const throwingExtra = {
                validate: () => {
                    throw new Error("extra validator exploded");
                },
            };
            const deliver = jest.fn(() => Promise.resolve({delivered: true}));
            const service = new ExternalDeploymentService(undefined, undefined, throwingExtra);

            const result = await service.deploy(baseTarget({runtimeAdapter: {deliver}}), compatibleModes());

            expect(result.artifactIssues.map((issue) => issue.code)).toContain("external-deployment-extra-artifact-validator-threw");
            expect(deliver).not.toHaveBeenCalled();
        });
    });

    it("skips delivery when the diagnostic reports not-ok", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true}));
        const target = baseTarget({
            diagnostic: {diagnose: () => Promise.resolve({ok: false, checks: [{name: "endpointReachable", ok: false, message: "unreachable"}]})},
            runtimeAdapter: {deliver},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(result.diagnostic?.ok).toBe(false);
        expect(result.delivery).toBeUndefined();
        expect(deliver).not.toHaveBeenCalled();
    });

    it("runs the full pipeline through to delivery when every stage succeeds", async () => {
        const deliver = jest.fn(() => Promise.resolve({delivered: true, details: {published: true}}));
        const target = baseTarget({
            diagnostic: {diagnose: () => Promise.resolve({ok: true, checks: []})},
            runtimeAdapter: {deliver},
        });

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(result.descriptorIssues).toEqual([]);
        expect(result.compatibilityIssues).toEqual([]);
        expect(result.projectionIssues).toEqual([]);
        expect(result.artifactIssues).toEqual([]);
        expect(result.diagnostic?.ok).toBe(true);
        expect(result.delivery?.delivered).toBe(true);
        expect(deliver).toHaveBeenCalledTimes(1);
    });

    it("skips diagnostic and delivery entirely when the target declares neither", async () => {
        const target = baseTarget();

        const result = await new ExternalDeploymentService().deploy(target, compatibleModes());

        expect(result.artifactIssues).toEqual([]);
        expect(result.diagnostic).toBeUndefined();
        expect(result.delivery).toBeUndefined();
    });
});

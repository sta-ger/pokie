import {
    ExternalArtifactGenerationResult,
    ExternalDeploymentDuplicateTargetError,
    ExternalDeploymentInvalidTargetError,
    ExternalDeploymentProjectedModeInput,
    ExternalDeploymentTarget,
    ExternalDeploymentTargetRegistry,
    ExternalRoundProjector,
    RoundArtifact,
} from "pokie";

class NoOpRoundProjector implements ExternalRoundProjector {
    public project(_artifact: RoundArtifact): Record<string, never> {
        return {};
    }
}

function stubTarget(id: string, overrides: Partial<ExternalDeploymentTarget> = {}): ExternalDeploymentTarget {
    return {
        id,
        version: "1.0.0",
        requirements: {},
        capabilities: [],
        roundProjector: new NoOpRoundProjector(),
        artifactGenerator: {
            generate(_modes: readonly ExternalDeploymentProjectedModeInput[]): ExternalArtifactGenerationResult {
                return {artifacts: [], issues: []};
            },
        },
        ...overrides,
    };
}

describe("ExternalDeploymentTargetRegistry", () => {
    it("registers and retrieves a target by id", () => {
        const registry = new ExternalDeploymentTargetRegistry();
        const target = stubTarget("acme-rgs");

        registry.register(target);

        expect(registry.has("acme-rgs")).toBe(true);
        expect(registry.get("acme-rgs")).toBe(target);
        expect(registry.list()).toEqual([target]);
    });

    it("get() and has() are case-insensitive", () => {
        const registry = new ExternalDeploymentTargetRegistry();
        registry.register(stubTarget("Acme-RGS"));

        expect(registry.has("acme-rgs")).toBe(true);
        expect(registry.get("ACME-RGS")?.id).toBe("Acme-RGS");
    });

    it("returns undefined/false for an unregistered id", () => {
        const registry = new ExternalDeploymentTargetRegistry();
        expect(registry.has("missing")).toBe(false);
        expect(registry.get("missing")).toBeUndefined();
    });

    it("throws ExternalDeploymentDuplicateTargetError registering the exact same id twice", () => {
        const registry = new ExternalDeploymentTargetRegistry();
        registry.register(stubTarget("acme-rgs"));

        expect(() => registry.register(stubTarget("acme-rgs"))).toThrow(ExternalDeploymentDuplicateTargetError);
    });

    it("throws ExternalDeploymentDuplicateTargetError for a case-only id collision", () => {
        const registry = new ExternalDeploymentTargetRegistry();
        registry.register(stubTarget("acme-rgs"));

        expect(() => registry.register(stubTarget("Acme-RGS"))).toThrow(ExternalDeploymentDuplicateTargetError);
    });

    it("keeps the first-registered target on a collision — the second register() call never overwrites it", () => {
        const registry = new ExternalDeploymentTargetRegistry();
        const first = stubTarget("acme-rgs");
        registry.register(first);

        expect(() => registry.register(stubTarget("ACME-RGS"))).toThrow(ExternalDeploymentDuplicateTargetError);
        expect(registry.get("acme-rgs")).toBe(first);
        expect(registry.list()).toHaveLength(1);
    });

    describe("descriptor validation", () => {
        it("rejects an empty id with ExternalDeploymentInvalidTargetError", () => {
            const registry = new ExternalDeploymentTargetRegistry();
            expect(() => registry.register(stubTarget(""))).toThrow(ExternalDeploymentInvalidTargetError);
        });

        it("rejects an empty version", () => {
            const registry = new ExternalDeploymentTargetRegistry();
            expect(() => registry.register(stubTarget("acme-rgs", {version: ""}))).toThrow(ExternalDeploymentInvalidTargetError);
        });

        it("rejects a target whose artifactGenerator is missing a generate method", () => {
            const registry = new ExternalDeploymentTargetRegistry();
            const malformed = stubTarget("acme-rgs", {artifactGenerator: {} as ExternalDeploymentTarget["artifactGenerator"]});
            expect(() => registry.register(malformed)).toThrow(ExternalDeploymentInvalidTargetError);
        });

        it("rejects a target whose roundProjector is missing a project method", () => {
            const registry = new ExternalDeploymentTargetRegistry();
            const malformed = stubTarget("acme-rgs", {roundProjector: {} as ExternalDeploymentTarget["roundProjector"]});
            expect(() => registry.register(malformed)).toThrow(ExternalDeploymentInvalidTargetError);
        });

        it("rejects a target whose optional artifactValidator is present but missing a validate method", () => {
            const registry = new ExternalDeploymentTargetRegistry();
            const malformed = stubTarget("acme-rgs", {artifactValidator: {} as ExternalDeploymentTarget["artifactValidator"]});
            expect(() => registry.register(malformed)).toThrow(ExternalDeploymentInvalidTargetError);
        });

        it("rejects duplicate capabilities", () => {
            const registry = new ExternalDeploymentTargetRegistry();
            const malformed = stubTarget("acme-rgs", {capabilities: ["multiMode", "multiMode"]});
            expect(() => registry.register(malformed)).toThrow(ExternalDeploymentInvalidTargetError);
        });

        it("rejects capabilities differing only in case", () => {
            const registry = new ExternalDeploymentTargetRegistry();
            const malformed = stubTarget("acme-rgs", {capabilities: ["multiMode", "MULTIMODE"]});
            expect(() => registry.register(malformed)).toThrow(ExternalDeploymentInvalidTargetError);
        });

        it("rejects an invalid requirements.minPokieVersion", () => {
            const registry = new ExternalDeploymentTargetRegistry();
            const malformed = stubTarget("acme-rgs", {requirements: {minPokieVersion: "not-a-version"}});
            expect(() => registry.register(malformed)).toThrow(ExternalDeploymentInvalidTargetError);
        });

        it("rejects an invalid requirements.symbolAlphabet", () => {
            const registry = new ExternalDeploymentTargetRegistry();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const malformed = stubTarget("acme-rgs", {requirements: {symbolAlphabet: "letters" as any}});
            expect(() => registry.register(malformed)).toThrow(ExternalDeploymentInvalidTargetError);
        });

        it("does not register a target that fails descriptor validation", () => {
            const registry = new ExternalDeploymentTargetRegistry();
            try {
                registry.register(stubTarget("acme-rgs", {version: ""}));
            } catch {
                // expected
            }
            expect(registry.has("acme-rgs")).toBe(false);
        });
    });

    describe("identity protection after registration", () => {
        it("freezes a registered target so its id can no longer be reassigned", () => {
            const registry = new ExternalDeploymentTargetRegistry();
            const target = stubTarget("acme-rgs");
            registry.register(target);

            expect(() => {
                (target as {id: string}).id = "renamed";
            }).toThrow(TypeError);
            expect(registry.get("acme-rgs")).toBe(target);
            expect(target.id).toBe("acme-rgs");
        });

        it("freezes a registered target's capabilities array against later mutation", () => {
            const registry = new ExternalDeploymentTargetRegistry();
            const target = stubTarget("acme-rgs", {capabilities: ["multiMode"]});
            registry.register(target);

            expect(() => (target.capabilities as string[]).push("extra")).toThrow(TypeError);
        });
    });
});

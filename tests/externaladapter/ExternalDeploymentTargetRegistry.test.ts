import {
    ExternalArtifactGenerationResult,
    ExternalDeploymentDuplicateTargetError,
    ExternalDeploymentModeInput,
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

function stubTarget(id: string): ExternalDeploymentTarget {
    return {
        id,
        version: "1.0.0",
        requirements: {},
        capabilities: [],
        roundProjector: new NoOpRoundProjector(),
        artifactGenerator: {
            generate(_modes: readonly ExternalDeploymentModeInput[]): ExternalArtifactGenerationResult {
                return {artifacts: [], issues: []};
            },
        },
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

    it("rejects an empty id", () => {
        const registry = new ExternalDeploymentTargetRegistry();
        expect(() => registry.register(stubTarget(""))).toThrow(ExternalDeploymentDuplicateTargetError);
    });

    it("keeps the first-registered target on a collision — the second register() call never overwrites it", () => {
        const registry = new ExternalDeploymentTargetRegistry();
        const first = stubTarget("acme-rgs");
        registry.register(first);

        expect(() => registry.register(stubTarget("ACME-RGS"))).toThrow(ExternalDeploymentDuplicateTargetError);
        expect(registry.get("acme-rgs")).toBe(first);
        expect(registry.list()).toHaveLength(1);
    });
});

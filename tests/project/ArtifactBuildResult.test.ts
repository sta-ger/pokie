import {
    requireManagedOutcomeProjectOwnership,
    type ManagedOutcomeProjectOwnership,
} from "../../src/project/ArtifactBuildResult.js";

describe("requireManagedOutcomeProjectOwnership", () => {
    it("returns no ownership for a result without managed roots", () => {
        expect(requireManagedOutcomeProjectOwnership({outputPath: "/out"})).toEqual([]);
    });

    it("returns reported per-root ownership", () => {
        const ownership: ManagedOutcomeProjectOwnership[] = [
            {rootPath: "/managed", sourceRootPath: "/source", disposition: "owned"},
        ];
        const result = {
            outputPath: "/out",
            managedProjectRoots: ["/managed"],
            managedOutcomeProjectOwnership: ownership,
        };

        expect(requireManagedOutcomeProjectOwnership(result)).toBe(ownership);
    });

    it("rejects managed roots without per-root ownership", () => {
        expect(() => requireManagedOutcomeProjectOwnership({
            outputPath: "/out",
            managedProjectRoots: ["/managed"],
        })).toThrow(/without per-root managedOutcomeProjectOwnership/);
    });
});

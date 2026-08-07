import type {ArtifactBuilder} from "../../src/project/ArtifactBuilder.js";
import {ArtifactBuildConflictError} from "../../src/project/ArtifactBuildConflictError.js";
import type {ArtifactBuildResult} from "../../src/project/ArtifactBuildResult.js";
import type {PokieProject} from "../../src/project/PokieProject.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";
import type {ProjectType} from "../../src/project/ProjectType.js";

function projectOf(type: ProjectType): PokieProject {
    return {
        type,
        rootPath: `/projects/${type}`,
        capabilities: PROJECT_TYPE_CAPABILITIES[type],
        provenance: "test fixture",
    } as PokieProject;
}

// A minimal fake standing in for a future concrete ArtifactBuilder -- no real filesystem work, just enough
// behavior to exercise the contract's two documented guarantees: a destination that already holds unowned
// content is reported as ArtifactBuildConflictError rather than silently overwritten, and a successful build
// is only ever observed either fully absent or fully present (a single atomic "publish" step), never
// partially written.
class FakeArtifactBuilder implements ArtifactBuilder {
    public readonly target = "tsPackage";
    public readonly destinationKind = "directory";
    public readonly publishedPaths: string[] = [];
    private readonly occupied: Set<string>;

    constructor(occupied: readonly string[] = []) {
        this.occupied = new Set(occupied);
    }

    public build(source: PokieProject, destinationPath: string): Promise<ArtifactBuildResult> {
        if (this.occupied.has(destinationPath)) {
            return Promise.reject(
                new ArtifactBuildConflictError(`"${destinationPath}" already exists and is not owned by this builder.`),
            );
        }

        // The atomic "publish" step every real per-target writer performs as a single, indivisible action --
        // nothing observes destinationPath in a half-written state between "not occupied" and "published".
        this.publishedPaths.push(destinationPath);
        return Promise.resolve({outputPath: destinationPath});
    }
}

describe("ArtifactBuilder", () => {
    it("accepts an already-resolved source PokieProject and a destination path, and reports where the artifact landed", async () => {
        const builder = new FakeArtifactBuilder();

        const result = await builder.build(projectOf("blueprint"), "/out/my-game");

        expect(result.outputPath).toBe("/out/my-game");
    });

    it("throws ArtifactBuildConflictError rather than silently overwriting an unowned destination", async () => {
        const builder = new FakeArtifactBuilder(["/out/my-game"]);

        await expect(builder.build(projectOf("blueprint"), "/out/my-game")).rejects.toThrow(ArtifactBuildConflictError);
        expect(builder.publishedPaths).toEqual([]);
    });

    it("never records a destination as published when the build is refused", async () => {
        const builder = new FakeArtifactBuilder(["/out/existing"]);

        await expect(builder.build(projectOf("blueprint"), "/out/existing")).rejects.toThrow(
            '"/out/existing" already exists and is not owned by this builder.',
        );
        expect(builder.publishedPaths).toEqual([]);
    });

    it("records a successful destination as published exactly once, atomically", async () => {
        const builder = new FakeArtifactBuilder();

        await builder.build(projectOf("blueprint"), "/out/fresh");

        expect(builder.publishedPaths).toEqual(["/out/fresh"]);
    });
});

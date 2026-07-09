import {PokieGameManifest} from "pokie";
import {CreateCommand} from "../../../cli/commands/CreateCommand";
import {GamePackageCreating} from "../../../cli/scaffold/GamePackageCreating";
import {ScaffoldResult} from "../../../cli/scaffold/ScaffoldResult";

function createStubCreator(result: ScaffoldResult): GamePackageCreating & {calledWith?: {parentDir: string; name: string}} {
    return {
        create(parentDir: string, name: string) {
            this.calledWith = {parentDir, name};
            return result;
        },
    };
}

describe("CreateCommand", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

    it("has the expected name and description", () => {
        const command = new CreateCommand(
            "1.2.1",
            createStubCreator({projectRoot: "/tmp/crazy-fruits", manifest, createdFiles: [], updatedFiles: [], skippedFiles: []}),
        );

        expect(command.getName()).toBe("create");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("throws when run without a project name", () => {
        const command = new CreateCommand("1.2.1", createStubCreator({projectRoot: "", manifest, createdFiles: [], updatedFiles: [], skippedFiles: []}));

        expect(() => command.run([])).toThrow(/Usage: pokie create <name>/);
    });

    it("creates the project under the current working directory using the given name", async () => {
        const projectRoot = `${process.cwd()}/crazy-fruits`;
        const stub = createStubCreator({
            projectRoot,
            manifest,
            createdFiles: ["package.json", "tsconfig.json", "src/index.ts", "src/CrazyFruitsGame.ts", "src/CrazyFruitsSession.ts"],
            updatedFiles: [],
            skippedFiles: [],
        });
        const command = new CreateCommand("1.2.1", stub);

        await expect(command.run(["crazy-fruits"])).resolves.toBeUndefined();
        expect(stub.calledWith).toEqual({parentDir: process.cwd(), name: "crazy-fruits"});
    });
});

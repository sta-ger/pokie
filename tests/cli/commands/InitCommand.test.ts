import {PokieGameManifest} from "pokie";
import {InitCommand} from "../../../cli/commands/InitCommand";
import {GamePackageScaffolding} from "../../../cli/scaffold/GamePackageScaffolding";
import {ScaffoldResult} from "../../../cli/scaffold/ScaffoldResult";

function createStubScaffolder(result: ScaffoldResult): GamePackageScaffolding & {scaffoldedRoot?: string} {
    return {
        scaffold(projectRoot: string) {
            this.scaffoldedRoot = projectRoot;
            return result;
        },
    };
}

describe("InitCommand", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "1.0.0"};

    it("has the expected name and description", () => {
        const command = new InitCommand("1.2.1", createStubScaffolder({projectRoot: "/tmp/x", manifest, createdFiles: [], updatedFiles: [], skippedFiles: []}));

        expect(command.getName()).toBe("init");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("scaffolds the current working directory and resolves without throwing", async () => {
        const stub = createStubScaffolder({
            projectRoot: process.cwd(),
            manifest,
            createdFiles: ["src/index.ts", "tsconfig.json"],
            updatedFiles: ["package.json"],
            skippedFiles: [],
        });
        const command = new InitCommand("1.2.1", stub);

        await expect(command.run()).resolves.toBeUndefined();
        expect(stub.scaffoldedRoot).toBe(process.cwd());
    });
});

import {CliCommandHandling} from "../CliCommandHandling.js";
import {GamePackageScaffolder} from "../scaffold/GamePackageScaffolder.js";
import {GamePackageScaffolding} from "../scaffold/GamePackageScaffolding.js";

export class InitCommand implements CliCommandHandling {
    private readonly scaffolder: GamePackageScaffolding;

    constructor(pokieVersion: string, scaffolder: GamePackageScaffolding = new GamePackageScaffolder(pokieVersion)) {
        this.scaffolder = scaffolder;
    }

    public getName(): string {
        return "init";
    }

    public getDescription(): string {
        return "Turn the current npm project into a minimal POKIE-compatible game package.";
    }

    public run(): Promise<void> {
        const result = this.scaffolder.scaffold(process.cwd());

        for (const file of result.createdFiles) {
            console.log(`  created  ${file}`);
        }
        for (const file of result.updatedFiles) {
            console.log(`  updated  ${file}`);
        }
        for (const file of result.skippedFiles) {
            console.log(`  skipped  ${file} (already exists)`);
        }

        console.log(`\nGame package ready: "${result.manifest.name}" (id: "${result.manifest.id}").`);
        console.log('Next: run "npm install" (to pull in the added devDependencies), then "npm run build".');
        console.log("Load it anywhere with: loadPokieGame(process.cwd()) from \"pokie\".");

        return Promise.resolve();
    }
}

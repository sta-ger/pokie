import {CliCommandHandling} from "../CliCommandHandling.js";
import {GamePackageCreating} from "../scaffold/GamePackageCreating.js";
import {GamePackageCreator} from "../scaffold/GamePackageCreator.js";

export class CreateCommand implements CliCommandHandling {
    private readonly creator: GamePackageCreating;

    constructor(pokieVersion: string, creator: GamePackageCreating = new GamePackageCreator(pokieVersion)) {
        this.creator = creator;
    }

    public getName(): string {
        return "create";
    }

    public getDescription(): string {
        return "Create a new POKIE-compatible game package in a new directory.";
    }

    public run(args: string[]): Promise<void> {
        const [name] = args;
        if (!name) {
            throw new Error("Usage: pokie create <name>");
        }

        const result = this.creator.create(process.cwd(), name);

        for (const file of result.createdFiles) {
            console.log(`  created  ${file}`);
        }

        console.log(`\nGame package "${result.manifest.name}" (id: "${result.manifest.id}") created in "${result.projectRoot}".`);
        console.log(`Next: cd ${name} && npm install && npm run build`);
        console.log('Load it anywhere with: loadPokieGame("' + result.projectRoot + '") from "pokie".');

        return Promise.resolve();
    }
}

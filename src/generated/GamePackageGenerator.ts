import fs from "fs";
import path from "path";
import type {GameBlueprint} from "./GameBlueprint.js";
import type {GamePackageGenerating} from "./GamePackageGenerating.js";
import type {GeneratedGamePackage} from "./GeneratedGamePackage.js";
import {renderGeneratedGameModule} from "./renderGeneratedGameModule.js";

export class GamePackageGenerator implements GamePackageGenerating {
    private readonly pokieVersion: string;

    constructor(pokieVersion: string) {
        this.pokieVersion = pokieVersion;
    }

    public generate(blueprint: GameBlueprint, cwd: string, outDir?: string): GeneratedGamePackage {
        const id = blueprint.manifest.id;
        if (outDir === undefined && (id.includes("/") || id.includes("\\") || id === "." || id === "..")) {
            throw new Error(
                `"manifest.id" ("${id}") is not a valid directory name. Use a plain name, e.g. "crazy-fruits", or pass --out <dir>.`,
            );
        }

        const projectRoot = outDir !== undefined ? path.resolve(cwd, outDir) : path.join(cwd, id);
        if (fs.existsSync(projectRoot)) {
            throw new Error(`"${projectRoot}" already exists. Choose a different output directory or remove it first.`);
        }

        fs.mkdirSync(path.join(projectRoot, "src", "generated"), {recursive: true});

        const packageJson = {
            name: id,
            version: blueprint.manifest.version,
            ...(blueprint.manifest.description ? {description: blueprint.manifest.description} : {}),
            ...(blueprint.manifest.author ? {author: blueprint.manifest.author} : {}),
            private: true,
            scripts: {
                start: "pokie dev .",
                server: "pokie serve .",
                client: "pokie client .",
            },
            dependencies: {
                pokie: `^${this.pokieVersion}`,
            },
            pokie: {
                entry: "./src/generated/index.js",
            },
        };

        fs.writeFileSync(path.join(projectRoot, "package.json"), `${JSON.stringify(packageJson, null, 4)}\n`);
        fs.writeFileSync(path.join(projectRoot, "src", "generated", "index.js"), renderGeneratedGameModule(blueprint));

        return {
            projectRoot,
            manifest: blueprint.manifest,
            createdFiles: ["package.json", "src/generated/index.js"],
        };
    }
}

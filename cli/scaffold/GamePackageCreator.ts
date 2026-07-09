import fs from "fs";
import path from "path";
import {PokieGameManifest} from "pokie";
import {buildPackageJsonPatch} from "./buildPackageJsonPatch.js";
import {deriveManifestDefaults} from "./deriveManifestDefaults.js";
import {GamePackageCreating} from "./GamePackageCreating.js";
import {renderGameModule} from "./renderGameModule.js";
import {renderIndexModule} from "./renderIndexModule.js";
import {renderSessionModule} from "./renderSessionModule.js";
import {renderTsconfig} from "./renderTsconfig.js";
import {ScaffoldResult} from "./ScaffoldResult.js";

const DEFAULT_VERSION = "0.1.0";

export class GamePackageCreator implements GamePackageCreating {
    private readonly pokieVersion: string;

    constructor(pokieVersion: string) {
        this.pokieVersion = pokieVersion;
    }

    public create(parentDir: string, name: string): ScaffoldResult {
        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            throw new Error("A project name is required: pokie create <name>");
        }
        if (trimmedName.includes("/") || trimmedName.includes("\\") || trimmedName === "." || trimmedName === "..") {
            throw new Error(`"${name}" is not a valid project name. Use a plain directory name, e.g. "crazy-fruits".`);
        }

        const projectRoot = path.join(parentDir, trimmedName);
        if (fs.existsSync(projectRoot)) {
            throw new Error(`"${projectRoot}" already exists. Choose a different name or remove the directory first.`);
        }

        const {id, name: gameName, className} = deriveManifestDefaults(trimmedName);
        const manifest: PokieGameManifest = {id, name: gameName, version: DEFAULT_VERSION};

        fs.mkdirSync(path.join(projectRoot, "src"), {recursive: true});

        const packageJson = buildPackageJsonPatch({name: trimmedName, version: DEFAULT_VERSION}, this.pokieVersion);
        fs.writeFileSync(path.join(projectRoot, "package.json"), `${JSON.stringify(packageJson, null, 4)}\n`);
        fs.writeFileSync(path.join(projectRoot, "tsconfig.json"), renderTsconfig());
        fs.writeFileSync(path.join(projectRoot, "src", "index.ts"), renderIndexModule(className));
        fs.writeFileSync(path.join(projectRoot, "src", `${className}Game.ts`), renderGameModule(manifest, className));
        fs.writeFileSync(path.join(projectRoot, "src", `${className}Session.ts`), renderSessionModule(className));

        return {
            projectRoot,
            manifest,
            createdFiles: [
                "package.json",
                "tsconfig.json",
                "src/index.ts",
                `src/${className}Game.ts`,
                `src/${className}Session.ts`,
            ],
            updatedFiles: [],
            skippedFiles: [],
        };
    }
}

import fs from "fs";
import path from "path";
import {PokieGameManifest} from "pokie";
import {buildPackageJsonPatch} from "./buildPackageJsonPatch.js";
import {deriveManifestDefaults} from "./deriveManifestDefaults.js";
import {GamePackageScaffolding} from "./GamePackageScaffolding.js";
import {PackageJsonLike} from "./PackageJsonLike.js";
import {renderEntryModule} from "./renderEntryModule.js";
import {renderTsconfig} from "./renderTsconfig.js";
import {ScaffoldResult} from "./ScaffoldResult.js";

export class GamePackageScaffolder implements GamePackageScaffolding {
    private readonly pokieVersion: string;

    constructor(pokieVersion: string) {
        this.pokieVersion = pokieVersion;
    }

    public scaffold(projectRoot: string): ScaffoldResult {
        const packageJsonPath = path.join(projectRoot, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
            throw new Error(`No "package.json" found in "${projectRoot}". Run "npm init -y" first, then re-run "pokie init".`);
        }

        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJsonLike;
        const {id, name} = deriveManifestDefaults(pkg.name);
        const manifest: PokieGameManifest = {
            id,
            name,
            version: pkg.version && pkg.version.length > 0 ? pkg.version : "0.0.0",
        };

        const createdFiles: string[] = [];
        const updatedFiles: string[] = [];
        const skippedFiles: string[] = [];

        const patchedPackageJson = buildPackageJsonPatch(pkg, this.pokieVersion);
        fs.writeFileSync(packageJsonPath, `${JSON.stringify(patchedPackageJson, null, 4)}\n`);
        updatedFiles.push("package.json");

        this.writeIfAbsent(path.join(projectRoot, "tsconfig.json"), "tsconfig.json", renderTsconfig(), createdFiles, skippedFiles);

        fs.mkdirSync(path.join(projectRoot, "src"), {recursive: true});
        this.writeIfAbsent(
            path.join(projectRoot, "src", "index.ts"),
            "src/index.ts",
            renderEntryModule(manifest),
            createdFiles,
            skippedFiles,
        );

        return {projectRoot, manifest, createdFiles, updatedFiles, skippedFiles};
    }

    private writeIfAbsent(
        filePath: string,
        displayPath: string,
        content: string,
        createdFiles: string[],
        skippedFiles: string[],
    ): void {
        if (fs.existsSync(filePath)) {
            skippedFiles.push(displayPath);
            return;
        }

        fs.writeFileSync(filePath, content);
        createdFiles.push(displayPath);
    }
}

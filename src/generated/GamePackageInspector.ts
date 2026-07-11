import fs from "fs";
import path from "path";
import type {GameBuildInfo} from "./GameBuildInfo.js";
import type {GamePackageInspecting} from "./GamePackageInspecting.js";
import type {GamePackageInspectionReport} from "./GamePackageInspectionReport.js";

// Reads what's already on disk — package.json and, when present, src/generated/build-info.json — to
// answer "what is this package and where did it come from" without loading/running the game at all
// (unlike PokieGamePackageValidator, which requires the entry module). Read-only: never writes.
export class GamePackageInspector implements GamePackageInspecting {
    public inspect(packageRoot: string): GamePackageInspectionReport {
        if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) {
            return {packageRoot, valid: false, generated: false, error: `"${packageRoot}" does not exist or is not a directory.`};
        }

        const packageJsonPath = path.join(packageRoot, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
            return {packageRoot, valid: false, generated: false, error: `"${packageJsonPath}" does not exist.`};
        }

        let packageJson: {name?: string; version?: string; description?: string};
        try {
            packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        } catch (error) {
            return {
                packageRoot,
                valid: false,
                generated: false,
                error: `"${packageJsonPath}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
            };
        }

        const buildInfo = this.readBuildInfo(packageRoot);

        return {
            packageRoot,
            valid: true,
            packageJson: {name: packageJson.name, version: packageJson.version, description: packageJson.description},
            generated: buildInfo !== undefined,
            buildInfo,
        };
    }

    private readBuildInfo(packageRoot: string): GameBuildInfo | undefined {
        const buildInfoPath = path.join(packageRoot, "src", "generated", "build-info.json");
        if (!fs.existsSync(buildInfoPath)) {
            return undefined;
        }

        try {
            const parsed = JSON.parse(fs.readFileSync(buildInfoPath, "utf-8"));
            if (!parsed || parsed.generatedBy !== "pokie build") {
                return undefined;
            }
            return parsed as GameBuildInfo;
        } catch {
            return undefined;
        }
    }
}

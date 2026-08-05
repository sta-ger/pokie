import fs from "fs";
import path from "path";
import type {GamePackageInspecting} from "./GamePackageInspecting.js";
import type {GamePackageInspectionReport} from "./GamePackageInspectionReport.js";

// Reads what's already on disk -- package.json -- to answer "what is this package" without loading/
// running the game at all (unlike PokieGamePackageValidator, which requires the entry module).
// Read-only: never writes.
export class GamePackageInspector implements GamePackageInspecting {
    public inspect(packageRoot: string): GamePackageInspectionReport {
        if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) {
            return {packageRoot, valid: false, error: `"${packageRoot}" does not exist or is not a directory.`};
        }

        const packageJsonPath = path.join(packageRoot, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
            return {packageRoot, valid: false, error: `"${packageJsonPath}" does not exist.`};
        }

        let packageJson: {name?: string; version?: string; description?: string};
        try {
            packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        } catch (error) {
            return {
                packageRoot,
                valid: false,
                error: `"${packageJsonPath}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
            };
        }

        return {
            packageRoot,
            valid: true,
            packageJson: {name: packageJson.name, version: packageJson.version, description: packageJson.description},
        };
    }
}

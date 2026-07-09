import type {PokiePackageConfig} from "./PokiePackageConfig.js";
import fs from "fs";
import path from "path";

export function readPokiePackageConfig(packageRoot: string): PokiePackageConfig {
    const packageJsonPath = path.join(packageRoot, "package.json");

    let packageJsonContent: string;
    try {
        packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
    } catch (error) {
        throw new Error(
            `Could not read "${packageJsonPath}": ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    let packageJson: {pokie?: {entry?: unknown}};
    try {
        packageJson = JSON.parse(packageJsonContent);
    } catch (error) {
        throw new Error(
            `Could not parse "${packageJsonPath}" as JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    const entry = packageJson.pokie?.entry;
    if (typeof entry !== "string" || entry.trim().length === 0) {
        throw new Error(
            `"${packageJsonPath}" is missing a "pokie.entry" field. Add e.g. {"pokie": {"entry": "./dist/index.js"}}.`,
        );
    }

    return {entry};
}

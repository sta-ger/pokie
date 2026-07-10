import fs from "fs";
import type {GameBlueprint} from "./GameBlueprint.js";

export function loadGameBlueprint(filePath: string): GameBlueprint {
    let content: string;
    try {
        content = fs.readFileSync(filePath, "utf-8");
    } catch (error) {
        throw new Error(
            `Could not read blueprint file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (error) {
        throw new Error(
            `Could not parse "${filePath}" as JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(`"${filePath}" must contain a JSON object describing a GameBlueprint.`);
    }

    return parsed as GameBlueprint;
}

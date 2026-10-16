import {validateBlueprintReelSequences} from "./validateBlueprintReelSequences.js";
import fs from "fs";
import type {GameBlueprint} from "./GameBlueprint.js";

export class GameBlueprintReadBudgetExceededError extends Error {}

function readBoundedBlueprint(filePath: string, maximumBytes: number): string {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 40000000) throw new Error("Invalid Blueprint source byte limit.");
    const descriptor = fs.openSync(filePath, "r");
    try {
        if (fs.fstatSync(descriptor).size > maximumBytes) throw new GameBlueprintReadBudgetExceededError("Blueprint source exceeds the acquisition byte budget.");
        const bytes = Buffer.alloc(maximumBytes + 1);
        let length = 0;
        while (length < bytes.length) {
            const count = fs.readSync(descriptor, bytes, length, bytes.length - length, null);
            if (count === 0) break;
            length += count;
        }
        if (length > maximumBytes) throw new GameBlueprintReadBudgetExceededError("Blueprint source grew beyond the acquisition byte budget.");
        return bytes.subarray(0, length).toString("utf8");
    } finally {
        fs.closeSync(descriptor);
    }
}

export function loadGameBlueprint(filePath: string, options?: {readonly preserveInvalidAuthoredContent?: boolean; readonly maxBytes?: number}): GameBlueprint {
    let content: string;
    try {
        content = options?.maxBytes === undefined ? fs.readFileSync(filePath, "utf-8") : readBoundedBlueprint(filePath, options.maxBytes);
    } catch (error) {
        if (error instanceof GameBlueprintReadBudgetExceededError) throw error;
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

    const issues = validateBlueprintReelSequences(parsed as Record<string, unknown>);
    if (issues.length && !options?.preserveInvalidAuthoredContent) throw new Error(issues.join("; "));
    return parsed as GameBlueprint;
}

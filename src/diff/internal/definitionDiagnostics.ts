import type {MathDefinitionDiagnostic} from "../MathDefinitionDiff.js";
import {modelFieldPathSegments} from "../../generated/internal/modelFieldPath.js";

function pointerPart(key: string): string {
    return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Adapt validator/extractor paths once at the definition boundary; exact copies are redundant. */
export function definitionDiagnostics(issues: MathDefinitionDiagnostic[]): MathDefinitionDiagnostic[] {
    const unique = new Map<string, MathDefinitionDiagnostic>();
    for (const issue of issues) {
        let path = issue.path;
        if (!path || path === "$") {
            const field = ["availableBets", "screenGeometry", "paytable", "reelStrips", "manifest", "symbols",
                "wilds", "scatters", "reels", "rows", "paylines", "mechanics", "winModel", "betModes"]
                .find(field => issue.code.startsWith(`blueprint-${field.toLowerCase()}`));
            path = field ?? "";
        }
        const keys = modelFieldPathSegments(path);
        if (keys) path = keys.length ? "/" + keys.map(pointerPart).join("/") : "";
        const normalized = {...issue, path};
        unique.set(JSON.stringify([path, issue.code, issue.severity, issue.message]), normalized);
    }
    return [...unique.entries()].sort(([a], [b]) => a < b ? -1 : Number(a > b)).map(([, issue]) => issue);
}

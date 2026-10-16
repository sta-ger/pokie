import type {PackageExtractionField} from "../../generated/PackageBlueprintExtraction.js";
import {modelFieldPathContains, modelFieldPathSegments} from "../../generated/internal/modelFieldPath.js";

/** Includes ancestors and descendants, used when normalization depends on the whole subtree. */
export function definitionFieldUnsupported(fields: PackageExtractionField[], keys: string[]): boolean {
    return fields.some(field => {
        const path = modelFieldPathSegments(field.path);
        return field.status === "unsupported" && path !== undefined &&
            (modelFieldPathContains(path, keys) || modelFieldPathContains(keys, path));
    });
}

/** Unsupported ancestors dominate exact/default evidence at every descendant. */
export function definitionFieldAuthority(fields: PackageExtractionField[], keys: string[]): PackageExtractionField | undefined {
    let exact: PackageExtractionField | undefined;
    let unsupported: PackageExtractionField | undefined;
    let depth = -1;
    for (const field of fields) {
        const path = modelFieldPathSegments(field.path);
        if (!path || !modelFieldPathContains(path, keys)) continue;
        if (field.status === "unsupported" && path.length > depth) {
            unsupported = field;
            depth = path.length;
        }
        if (!exact && path.length === keys.length) exact = field;
    }
    return unsupported ?? exact;
}

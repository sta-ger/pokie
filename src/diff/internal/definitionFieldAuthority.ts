import type {PackageExtractionField} from "../../generated/PackageBlueprintExtraction.js";

/** Unsupported ancestors dominate exact/default evidence at every descendant. */
export function definitionFieldAuthority(fields: PackageExtractionField[], keys: string[]): PackageExtractionField | undefined {
    const path = keys.join(".");
    return fields.filter((field) => field.status === "unsupported" &&
        (field.path === "$" || field.path === "" || field.path === path || path.startsWith(field.path + ".")))
        .sort((a, b) => b.path.length - a.path.length)[0] ?? fields.find((field) => field.path === path);
}

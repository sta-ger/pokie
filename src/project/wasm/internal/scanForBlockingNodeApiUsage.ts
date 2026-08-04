import fs from "fs";
import path from "path";
import type {WasmPackagingBlockingApiUsage} from "../WasmPackagingPreflightReport.js";
import {NODE_BUILTIN_MODULES} from "./NODE_BUILTIN_MODULES.js";

const SCANNABLE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"]);
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules", ".git"]);

// A line only worth scanning at all -- narrows every other line out before the (more expensive) specifier
// patterns below ever run.
const IMPORT_OR_REQUIRE_KEYWORD_PATTERN = /\b(?:import|require|export)\b/;

// Each pattern below captures only the module specifier of an actual static import/export-from/require --
// never an arbitrary quoted string elsewhere on the line (e.g. inside a comment or unrelated string literal
// that merely shares the line with an import-related keyword).
// import x from "y"; import {a, b} from "y"; import * as ns from "y"; import type x from "y"
const IMPORT_FROM_SPECIFIER_PATTERN = /\bimport\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g;
// import "y"; -- side-effect-only import with no "from"
const IMPORT_SIDE_EFFECT_SPECIFIER_PATTERN = /\bimport\s*['"]([^'"]+)['"]/g;
// import("y") -- dynamic import
const DYNAMIC_IMPORT_SPECIFIER_PATTERN = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
// export {a} from "y"; export * from "y"; export * as ns from "y"
const EXPORT_FROM_SPECIFIER_PATTERN = /\bexport\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g;
// require("y")
const REQUIRE_SPECIFIER_PATTERN = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const MODULE_SPECIFIER_PATTERNS = [
    IMPORT_FROM_SPECIFIER_PATTERN,
    IMPORT_SIDE_EFFECT_SPECIFIER_PATTERN,
    DYNAMIC_IMPORT_SPECIFIER_PATTERN,
    EXPORT_FROM_SPECIFIER_PATTERN,
    REQUIRE_SPECIFIER_PATTERN,
];

// Extracts every real module specifier on a line -- i.e. the argument of an import/export-from/require, never
// an unrelated quoted string that happens to share the line with an import-related keyword.
function extractModuleSpecifiers(line: string): string[] {
    const specifiers: string[] = [];
    for (const pattern of MODULE_SPECIFIER_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null) {
            specifiers.push(match[1]);
        }
    }
    return specifiers;
}

function listFilesRecursively(rootPath: string): string[] {
    const results: string[] = [];
    const stack = [rootPath];
    while (stack.length > 0) {
        const current = stack.pop() as string;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(current, {withFileTypes: true});
        } catch {
            continue;
        }
        for (const entry of entries) {
            const entryPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (!SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
                    stack.push(entryPath);
                }
                continue;
            }
            if (entry.isFile() && SCANNABLE_EXTENSIONS.has(path.extname(entry.name))) {
                results.push(entryPath);
            }
        }
    }
    return results;
}

// Whether a raw quoted specifier (e.g. "node:fs", "fs/promises", "fs-extra") names a Node built-in module --
// strips an optional leading "node:", then compares only the specifier's own first path segment against
// NODE_BUILTIN_MODULES, so a submodule import ("fs/promises", "stream/web") is still caught while a
// merely-similarly-named npm package ("fs-extra", "path-to-regexp") is never mistaken for the builtin itself
// (an npm package name may contain a "/" for a scoped package like "@scope/pkg", but "@scope" is never a
// NODE_BUILTIN_MODULES entry, so it's correctly never matched either).
function blockingBuiltinModuleOf(rawSpecifier: string): string | undefined {
    const withoutNodePrefix = rawSpecifier.startsWith("node:") ? rawSpecifier.slice("node:".length) : rawSpecifier;
    const base = withoutNodePrefix.split("/")[0];
    return NODE_BUILTIN_MODULES.has(base) ? base : undefined;
}

// Statically scans every source file under `rootPath` (excluding "node_modules"/".git") for an import/require
// of a Node.js built-in module -- a plain regex over import/require/export-from specifiers, deliberately not a
// real JS/TS parser: good enough to *name* a blocker for a human to review (see assessWasmPackagingPreflight's
// own doc comment for why this preflight is advisory, never a compiler), never a claim that the absence of a
// match means the package is actually WASM-portable -- a builtin reached only through a re-exported wrapper,
// a dynamically constructed specifier, or a transitive dependency is invisible to this scan.
export function scanForBlockingNodeApiUsage(rootPath: string): WasmPackagingBlockingApiUsage[] {
    const usages: WasmPackagingBlockingApiUsage[] = [];

    for (const filePath of listFilesRecursively(rootPath)) {
        const contents = fs.readFileSync(filePath, "utf-8");
        contents.split("\n").forEach((line, index) => {
            if (!IMPORT_OR_REQUIRE_KEYWORD_PATTERN.test(line)) {
                return;
            }
            for (const specifier of extractModuleSpecifiers(line)) {
                const blockingModule = blockingBuiltinModuleOf(specifier);
                if (blockingModule !== undefined) {
                    usages.push({module: blockingModule, filePath: path.relative(rootPath, filePath), line: index + 1});
                }
            }
        });
    }

    return usages;
}

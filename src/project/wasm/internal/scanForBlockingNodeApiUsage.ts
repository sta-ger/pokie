import fs from "fs";
import path from "path";
import type {WasmPackagingBlockingApiUsage} from "../WasmPackagingPreflightReport.js";
import {NODE_BUILTIN_MODULES} from "./NODE_BUILTIN_MODULES.js";

const SCANNABLE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"]);
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules", ".git"]);

// A line only worth scanning at all -- narrows every other line out before the (more expensive) specifier
// patterns below ever run. Runs against the *masked* line (see maskCommentsAndStrings) so a keyword that only
// exists inside a comment or a string literal never counts.
const IMPORT_OR_REQUIRE_KEYWORD_PATTERN = /\b(?:import|require|export)\b/;

// Each pattern below captures only the module specifier of an actual static import/export-from/require --
// never an arbitrary quoted string elsewhere on the line (e.g. inside a comment or unrelated string literal
// that merely shares the line with an import-related keyword). They run against the masked line produced by
// maskCommentsAndStrings, where every comment is gone and every string/template literal's content has been
// replaced by a placeholder token; a real specifier's placeholder is resolved back to its original text via
// STRING_PLACEHOLDER_PATTERN afterwards, so a specifier is only ever real, executable source text.
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

// Delimits a string literal's placeholder in a masked line -- a token no real module specifier would ever
// collide with, so a captured "specifier" is recognized as a placeholder only when it's exactly this shape.
const STRING_PLACEHOLDER_PREFIX = "POKIE_WASM_PREFLIGHT_STRING_";
const STRING_PLACEHOLDER_PATTERN = new RegExp(`^${STRING_PLACEHOLDER_PREFIX}(\\d+)$`);

// Carries comment/string context from one line to the next -- a block comment or a template literal that
// doesn't close on the line it starts must keep masking every subsequent line until it actually closes,
// rather than each line being scanned as if it started fresh at top-level code.
interface CommentStringMaskState {
    inBlockComment: boolean;
    inTemplateLiteral: boolean;
    templateLiteralContent: string;
}

function createCommentStringMaskState(): CommentStringMaskState {
    return {inBlockComment: false, inTemplateLiteral: false, templateLiteralContent: ""};
}

// Scans template-literal content starting at `startIndex` in `line`, honoring backslash escapes. When the
// closing backtick is found on this line, `closingIndex` is the index right after it and scanning can resume
// as normal code from there; otherwise `closingIndex` is -1 and `content` is the rest of the line, meaning the
// literal continues onto the next line.
function consumeTemplateLiteralChunk(line: string, startIndex: number): {content: string; closingIndex: number} {
    let content = "";
    let j = startIndex;
    while (j < line.length && line[j] !== "`") {
        if (line[j] === "\\" && j + 1 < line.length) {
            content += line[j] + line[j + 1];
            j += 2;
            continue;
        }
        content += line[j];
        j += 1;
    }
    if (j >= line.length) {
        return {content, closingIndex: -1};
    }
    return {content, closingIndex: j + 1};
}

// Strips `//` and `/* */` comments and replaces every string/template literal's content with a placeholder
// token, so the specifier patterns above can never match import-like text that only exists inside a comment
// or an unrelated string. Quote characters are preserved (as a canonical `"`) so a real specifier's own
// quoted string is still recognized as a string; `stringLiterals[i]` holds that placeholder's real content
// (escape sequences left as-is) for resolving an extracted specifier back to its actual text. `state` is
// mutated in place so a block comment or template literal left open at the end of this line keeps masking
// subsequent lines from the caller until it actually closes -- single/double-quoted strings and `//` comments
// never legitimately span multiple lines, so those remain scoped to the current line only.
function maskCommentsAndStrings(line: string, state: CommentStringMaskState): {maskedLine: string; stringLiterals: string[]} {
    const stringLiterals: string[] = [];
    let maskedLine = "";
    let i = 0;

    if (state.inBlockComment) {
        const end = line.indexOf("*/");
        if (end === -1) {
            return {maskedLine, stringLiterals};
        }
        state.inBlockComment = false;
        i = end + 2;
    }

    if (state.inTemplateLiteral) {
        const {content, closingIndex} = consumeTemplateLiteralChunk(line, i);
        if (closingIndex === -1) {
            state.templateLiteralContent += `\n${content}`;
            return {maskedLine, stringLiterals};
        }
        stringLiterals.push(`${state.templateLiteralContent}\n${content}`);
        maskedLine += `"${STRING_PLACEHOLDER_PREFIX}${stringLiterals.length - 1}"`;
        state.inTemplateLiteral = false;
        state.templateLiteralContent = "";
        i = closingIndex;
    }

    while (i < line.length) {
        const ch = line[i];
        const next = line[i + 1];
        if (ch === "/" && next === "/") {
            break;
        }
        if (ch === "/" && next === "*") {
            const end = line.indexOf("*/", i + 2);
            if (end === -1) {
                state.inBlockComment = true;
                break;
            }
            i = end + 2;
            continue;
        }
        if (ch === "`") {
            const {content, closingIndex} = consumeTemplateLiteralChunk(line, i + 1);
            if (closingIndex === -1) {
                state.inTemplateLiteral = true;
                state.templateLiteralContent = content;
                break;
            }
            stringLiterals.push(content);
            maskedLine += `"${STRING_PLACEHOLDER_PREFIX}${stringLiterals.length - 1}"`;
            i = closingIndex;
            continue;
        }
        if (ch === '"' || ch === "'") {
            const quote = ch;
            let content = "";
            let j = i + 1;
            while (j < line.length && line[j] !== quote) {
                if (line[j] === "\\" && j + 1 < line.length) {
                    content += line[j] + line[j + 1];
                    j += 2;
                    continue;
                }
                content += line[j];
                j += 1;
            }
            stringLiterals.push(content);
            maskedLine += `"${STRING_PLACEHOLDER_PREFIX}${stringLiterals.length - 1}"`;
            i = j + 1;
            continue;
        }
        maskedLine += ch;
        i += 1;
    }
    return {maskedLine, stringLiterals};
}

// Extracts every real module specifier on a masked line -- i.e. the argument of an import/export-from/require,
// resolved back from its placeholder to the string literal's real content.
function extractModuleSpecifiers(maskedLine: string, stringLiterals: string[]): string[] {
    const specifiers: string[] = [];
    for (const pattern of MODULE_SPECIFIER_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(maskedLine)) !== null) {
            const placeholderMatch = STRING_PLACEHOLDER_PATTERN.exec(match[1]);
            if (placeholderMatch !== null) {
                specifiers.push(stringLiterals[Number(placeholderMatch[1])]);
            }
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
        const maskState = createCommentStringMaskState();
        contents.split("\n").forEach((line, index) => {
            const {maskedLine, stringLiterals} = maskCommentsAndStrings(line, maskState);
            if (!IMPORT_OR_REQUIRE_KEYWORD_PATTERN.test(maskedLine)) {
                return;
            }
            for (const specifier of extractModuleSpecifiers(maskedLine, stringLiterals)) {
                const blockingModule = blockingBuiltinModuleOf(specifier);
                if (blockingModule !== undefined) {
                    usages.push({module: blockingModule, filePath: path.relative(rootPath, filePath), line: index + 1});
                }
            }
        });
    }

    return usages;
}

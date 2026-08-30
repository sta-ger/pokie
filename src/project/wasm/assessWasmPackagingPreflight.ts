import fs from "fs";
import path from "path";
import {WASM_PACKAGING_PREFLIGHT_OPERATION} from "../PokieOperation.js";
import type {PokieProject} from "../PokieProject.js";
import {describeUnsupportedProjectOperation} from "../describeUnsupportedProjectOperation.js";
import {describeWasmPackagingPreflightNote} from "../WasmProductContract.js";
import type {UnsupportedProjectOperationDiagnostic} from "../UnsupportedProjectOperationDiagnostic.js";
import {scanForBlockingNodeApiUsage} from "./internal/scanForBlockingNodeApiUsage.js";
import type {WasmPackagingPreflightReport} from "./WasmPackagingPreflightReport.js";

export type WasmPackagingPreflightResult =
    | {readonly supported: true; readonly report: WasmPackagingPreflightReport}
    | {readonly supported: false; readonly diagnostic: UnsupportedProjectOperationDiagnostic};

function readDeclaredDependencies(rootPath: string): readonly string[] {
    try {
        const parsed = JSON.parse(fs.readFileSync(path.join(rootPath, "package.json"), "utf-8")) as {
            dependencies?: Record<string, unknown>;
        };
        return Object.keys(parsed.dependencies ?? {}).sort();
    } catch {
        return [];
    }
}

// Advisory-only preflight for a resolved "tsPackage" project: names every Node.js built-in module its own
// source imports/requires (see scanForBlockingNodeApiUsage's own doc comment on how, and its limits) and lists
// its package.json's own declared runtime dependencies verbatim — never a verdict on whether any specific
// dependency is itself WASM/browser-portable, since POKIE has no way to know that about a third-party package
// without actually trying to bundle it. `report.notes` explicitly records that WASM is inspection-only, so this
// preflight can never be read as "no blockers found, therefore compilation works": no POKIE command builds WASM
// from any source today, regardless of what this scan finds. Never throws (a missing/unreadable package.json is reported as no declared
// dependencies, not an error — the scan itself still runs).
export function assessWasmPackagingPreflight(project: PokieProject): WasmPackagingPreflightResult {
    const diagnostic = describeUnsupportedProjectOperation(project, WASM_PACKAGING_PREFLIGHT_OPERATION);
    if (diagnostic !== undefined) {
        return {supported: false, diagnostic};
    }

    return {
        supported: true,
        report: {
            rootPath: project.rootPath,
            blockingApiUsages: scanForBlockingNodeApiUsage(project.rootPath),
            declaredDependencies: readDeclaredDependencies(project.rootPath),
            notes: [describeWasmPackagingPreflightNote()],
        },
    };
}

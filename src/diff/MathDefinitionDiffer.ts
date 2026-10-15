import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {validateMathDefinitionMaxWinPolicy} from "./validateMathDefinitionMaxWinPolicy.js";
import {detachPackageModelData} from "../generated/PackageBlueprintExtraction.js";
import type {
    DefinitionJson,
    MathDefinitionChange,
    MathDefinitionDiff,
    MathDefinitionDiffing,
    MathDefinitionSnapshot,
    MathDefinitionValue,
} from "./MathDefinitionDiff.js";

export function definitionPointerPart(key: string): string {
    return key.replace(/~/g, "~0").replace(/\//g, "~1");
}
export function canonicalDefinitionJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalDefinitionJson).join(",")}]`;
    if (value !== null && typeof value === "object") return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalDefinitionJson(Reflect.get(value, key))}`)
        .join(",")}}`;
    return JSON.stringify(value);
}
function valueAt(value: unknown, keys: string[]): {present: false} | {present: true; value: DefinitionJson} {
    for (const key of keys) {
        if (
            value === null ||
            typeof value !== "object" ||
            !Reflect.apply(Object.prototype.hasOwnProperty, value, [key])
        ) return {present: false};
        value = Reflect.get(value, key);
    }
    return value === undefined ? {present: false} : {present: true, value: value as DefinitionJson};
}
function side(
    snapshot: MathDefinitionSnapshot,
    value: ReturnType<typeof valueAt>,
    keys: string[],
): MathDefinitionValue {
    const authored = valueAt(snapshot.authored, keys);
    const field = snapshot.fields.find((entry) => entry.path === keys.join("."));
    let status: MathDefinitionValue["provenance"]["status"] = "effective";
    if (field?.status === "unsupported") status = "unknown";
    else if (field?.status === "inferred") status = "effective";
    else if (authored.present) status = "authored";
    else if (value.present) status = "defaulted";
    return {...value, provenance: {authority: field?.authority ?? snapshot.identity.kind, status, authored}};
}
function context(snapshot: MathDefinitionSnapshot, keys: string[]): Record<string, string | number> {
    const result: Record<string, string | number> = {};
    const model = snapshot.effective ?? snapshot.authored;
    const text = (name: string, path: string[]): void => {
        const value = valueAt(model, path);
        if (value.present && typeof value.value === "string") result[name] = value.value;
    };
    if (["reelSequences", "reelStrips", "reelStripGeneration"].includes(keys[0]) && keys[1] !== undefined) result.reelIndex = Number(keys[1]);
    if (keys[0] === "reelSequences") {
        result.selectionContext = "logical-round-v1";
        result.samplingContract = "binary64-integer-ratios-v1";
        if (keys[2] === "variants" && keys[3] !== undefined) text("variantId", keys.slice(0, 4).concat("id"));
    }
    if (keys[0] === "paytable") {
        if (keys[1] !== undefined) result.symbolId = keys[1];
        if (keys[2] !== undefined) result.matchCount = keys[2];
    }
    if (keys[0] === "betModes" && keys[1] !== undefined) text("modeId", ["betModes", keys[1], "id"]);
    if (keys[0] === "mechanics") {
        result.feature = keys[1] ?? "mechanics";
        if (keys[1] === "weightedBonus") {
            text("tableId", ["mechanics", "weightedBonus", "id"]);
            text("selectionContext", ["mechanics", "weightedBonus", "context"]);
            text("featureId", ["mechanics", "weightedBonus", "feature", "id"]);
            result.samplingContract = "integer-cumulative-u32-v1";
            if (keys[2] === "outcomes" && keys[3] !== undefined) text("outcomeId", keys.slice(0, 4).concat("id"));
        }
    }
    return result;
}
function isRecord(value: unknown): value is Record<string, DefinitionJson> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function verifyCompleteness(snapshot: MathDefinitionSnapshot): void {
    if (snapshot.support !== "complete") return;
    const model = snapshot.effective;
    const missing =
        !isRecord(model) ||
        !isRecord(snapshot.authored) ||
        ["manifest", "reels", "rows", "symbols", "paytable"].some((key) => !(key in model)) ||
        (model.reelStrips === undefined && model.reelSequences === undefined) ||
        model.maxWinPolicy === undefined;
    if (missing || snapshot.fields.some((field) => field.status === "unsupported")) {
        snapshot.support = "partial";
        snapshot.diagnostics.push({
            code: "definition-snapshot-incomplete",
            severity: "warning",
            path: "",
            message:
                "Complete support requires an effective model, resolved reels, declared policy and no unsupported fields.",
        });
        return;
    }
    const typedModel = model as Record<string, DefinitionJson>;
    try {
        const policy = validateMathDefinitionMaxWinPolicy(typedModel.maxWinPolicy);
        if (policy.type === "unknown") {
            snapshot.support = "partial";
            snapshot.diagnostics.push({
                code: "max-win-policy-unknown",
                severity: "warning",
                path: "/maxWinPolicy",
                message: policy.authority,
            });
        }
        // Effective defaults can be forbidden as explicit authored fields for some feature families.
        // Validate the retained declaration rather than interpreting inserted defaults as author intent.
        const errors = new GameBlueprintValidator().validate(snapshot.authored).filter((issue) => issue.severity === "error");
        if (errors.length) {
            snapshot.support = "invalid";
            snapshot.diagnostics.push(
                ...errors.map((issue) => ({
                    code: issue.code,
                    severity: issue.severity,
                    path: issue.path ?? "",
                    message: issue.message,
                })),
            );
        }
    } catch (error) {
        snapshot.support = "invalid";
        snapshot.diagnostics.push({
            code: "definition-snapshot-invalid",
            severity: "error",
            path: "",
            message: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
        });
    }
}

/** Pure comparison: no loaders, sessions, RNG or runtime configuration writes. */
export class MathDefinitionDiffer implements MathDefinitionDiffing {
    public diff(leftInput: MathDefinitionSnapshot, rightInput: MathDefinitionSnapshot): MathDefinitionDiff {
        const left = detachPackageModelData(leftInput) as MathDefinitionSnapshot;
        const right = detachPackageModelData(rightInput) as MathDefinitionSnapshot;
        verifyCompleteness(left);
        verifyCompleteness(right);
        const changes: MathDefinitionChange[] = [];
        const walk = (a: unknown, b: unknown, keys: string[], representation = false): void => {
            if (canonicalDefinitionJson(a) === canonicalDefinitionJson(b)) return;
            const path = keys.length ? "/" + keys.map(definitionPointerPart).join("/") : "";
            if ((isRecord(a) && (isRecord(b) || b === undefined)) || (isRecord(b) && a === undefined)) {
                const before = isRecord(a) ? a : {};
                const after = isRecord(b) ? b : {};
                const childKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
                if (childKeys.length) {
                    for (const key of childKeys) walk(before[key], after[key], [...keys, key], representation);
                    return;
                }
            }
            const order =
                Array.isArray(a) &&
                Array.isArray(b) &&
                a.length === b.length &&
                canonicalDefinitionJson(a.map(canonicalDefinitionJson).sort()) ===
                    canonicalDefinitionJson(b.map(canonicalDefinitionJson).sort());
            if (Array.isArray(a) && Array.isArray(b) && !order) {
                for (let i = 0; i < Math.max(a.length, b.length); i++) walk(a[i], b[i], [...keys, String(i)], representation);
                return;
            }
            const zeroOmission =
                (keys[0] === "paytable" || keys.slice(0, 3).join("/") === "mechanics/freeGames/awardsByCount") &&
                ((a === undefined && (b === 0 || (isRecord(b) && Object.keys(b).length === 0))) ||
                    (b === undefined && (a === 0 || (isRecord(a) && Object.keys(a).length === 0))));
            const mathematical =
                !zeroOmission &&
                !representation &&
                keys[0] !== "manifest" &&
                !(keys[0] === "maxWinPolicy" && keys[1] === "authority");
            const classification = mathematical ? "mathematical" : "representation";
            changes.push({
                path,
                context: {before: context(left, keys), after: context(right, keys)},
                classification: order ? "order" : classification,
                mathematical,
                seededTraceImpact:
                    mathematical &&
                    order &&
                    (keys[0] === "reelStrips" ||
                        keys[0] === "reelSequences" ||
                        keys.slice(0, 2).join("/") === "mechanics/modifiers" ||
                        keys.slice(0, 2).join("/") === "mechanics/weightedBonus"),
                before: side(
                    left,
                    a === undefined ? {present: false} : {present: true, value: a as DefinitionJson},
                    keys,
                ),
                after: side(
                    right,
                    b === undefined ? {present: false} : {present: true, value: b as DefinitionJson},
                    keys,
                ),
            });
        };
        walk(left.effective, right.effective, []);
        // Retain authoring/default differences only where the effective comparison did not already
        // describe the field. Source identity is carried separately and never makes a math change.
        const effectiveChanges = changes.length;
        walk(left.authored, right.authored, [], true);
        const authoredChanges = changes
            .splice(effectiveChanges)
            .filter(
                (change) =>
                    !changes.some(
                        (existing) =>
                            existing.path === change.path ||
                            existing.path.startsWith(change.path + "/") ||
                            change.path.startsWith(existing.path + "/"),
                    ),
            );
        changes.push(...authoredChanges);
        const provenance = (keys: string[]): void => {
            const before = valueAt(left.effective, keys);
            const after = valueAt(right.effective, keys);
            if (!before.present || !after.present) return;
            if (isRecord(before.value) && isRecord(after.value)) {
                for (const key of Object.keys(before.value).sort()) provenance([...keys, key]);
                return;
            }
            const path = keys.length ? "/" + keys.map(definitionPointerPart).join("/") : "";
            if (
                canonicalDefinitionJson(before.value) !== canonicalDefinitionJson(after.value) ||
                changes.some(
                    (change) =>
                        change.path === path ||
                        path.startsWith(change.path + "/") ||
                        change.path.startsWith(path + "/"),
                )
            ) return;
            const a = side(left, before, keys);
            const b = side(right, after, keys);
            if (a.provenance.authority !== b.provenance.authority || a.provenance.status !== b.provenance.status) changes.push({
                path,
                classification: "provenance",
                mathematical: false,
                seededTraceImpact: false,
                before: a,
                after: b,
            });
        };
        provenance([]);
        const diagnostics = (snapshot: MathDefinitionSnapshot): Map<string, DefinitionJson> =>
            new Map(
                snapshot.diagnostics.map((issue) => [
                    `/validation/${definitionPointerPart(issue.path)}/${definitionPointerPart(issue.code)}`,
                    issue as unknown as DefinitionJson,
                ]),
            );
        const a = diagnostics(left);
        const b = diagnostics(right);
        for (const path of [...new Set([...a.keys(), ...b.keys()])].sort()) {
            if (canonicalDefinitionJson(a.get(path)) === canonicalDefinitionJson(b.get(path))) continue;
            const before = a.get(path);
            const after = b.get(path);
            changes.push({
                path,
                classification: "validation",
                mathematical: false,
                seededTraceImpact: false,
                before: side(left, before === undefined ? {present: false} : {present: true, value: before}, [
                    "validation",
                ]),
                after: side(right, after === undefined ? {present: false} : {present: true, value: after}, [
                    "validation",
                ]),
            });
        }
        changes.sort((a, b) => (a.path < b.path ? -1 : Number(a.path > b.path)));
        let status: MathDefinitionDiff["status"] = changes.length ? "different" : "identical";
        const supports = [left.support, right.support];
        if (supports.includes("partial") || supports.includes("unsupported")) status = "partial";
        if (supports.every((support) => support === "unsupported")) status = "unsupported";
        for (const failure of ["invalid", "cancelled", "failed"] as const) if (supports.includes(failure)) status = failure;
        return {
            schemaVersion: 1,
            comparisonKind: "math-definition",
            scope: "declared-effective-model",
            status,
            left,
            right,
            changes,
        };
    }
}

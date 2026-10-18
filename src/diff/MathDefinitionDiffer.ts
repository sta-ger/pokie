import {definitionPreprocessingWork} from "../validation/internal/definitionPreprocessingWork.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {modelFieldPathSegments} from "../generated/internal/modelFieldPath.js";
import {definitionDiagnostics} from "./internal/definitionDiagnostics.js";
import {definitionFieldAuthority, definitionFieldUnsupported} from "./internal/definitionFieldAuthority.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {validateMathDefinitionMaxWinPolicy} from "./validateMathDefinitionMaxWinPolicy.js";
import {detachPackageModelData} from "../generated/internal/detachPackageModelData.js";
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
    effective = false,
): MathDefinitionValue {
    if (effective && keys[0] === "reelStrips" && exactSequenceStrips(snapshot)) {
        keys = keys.length === 1 ? ["reelSequences"] :
            ["reelSequences", keys[1], "symbols", ...keys.slice(2)];
    }
    const authored = valueAt(snapshot.authored, keys);
    const field = definitionFieldAuthority(snapshot.fields, keys);
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

/** Both declarations construct SymbolsSequence; weighted variants retain their selection contract. */
function exactSequenceStrips(snapshot: MathDefinitionSnapshot): DefinitionJson[][] | undefined {
    const model = snapshot.effective;
    if (!isRecord(model) || model.reelStrips !== undefined || !Array.isArray(model.reelSequences) ||
        !model.reelSequences.length || definitionFieldUnsupported(snapshot.fields, ["reelSequences"])) return undefined;
    const strips: DefinitionJson[][] = [];
    for (const reel of model.reelSequences) {
        if (!isRecord(reel) || reel.type !== "exact" || !Array.isArray(reel.symbols) ||
            Object.keys(reel).some(key => !["type", "symbols"].includes(key))) return undefined;
        strips.push(reel.symbols);
    }
    return strips;
}
function effectiveModel(snapshot: MathDefinitionSnapshot): DefinitionJson | undefined {
    const strips = exactSequenceStrips(snapshot);
    if (!strips) return snapshot.effective;
    const {reelSequences: _sequences, ...model} = snapshot.effective as Record<string, DefinitionJson>;
    return {...model, reelStrips: strips};
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
    if (definitionPreprocessingWork(snapshot.authored as Partial<GameBlueprint>) > 100000) {
        snapshot.support = "unsupported";
        snapshot.diagnostics.push({code: "definition-acquisition-budget-exhausted", severity: "warning", path: "", message: "Definition preprocessing exceeds its bounded normalization work limit."});
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
        left.diagnostics = definitionDiagnostics(left.diagnostics);
        right.diagnostics = definitionDiagnostics(right.diagnostics);
        const leftModel = effectiveModel(left);
        const rightModel = effectiveModel(right);
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
            const descriptiveModeField = keys[0] === "betModes" && (
                ["label", "targetRtp"].includes(keys[2]) ||
                (["costMultiplier", "isDefault"].includes(keys[2]) && [left, right].every(snapshot => {
                    // Custom descriptors without runtimeType do not establish generated semantics.
                    const modes = valueAt(snapshot.effective, ["betModes"]);
                    return (snapshot.identity.kind === "blueprint" || snapshot.identity.descriptorKind === "generated") &&
                        modes.present && Array.isArray(modes.value) &&
                        modes.value.every(mode => isRecord(mode) && mode.runtimeType === undefined);
                }))
            );
            const inventoryOrder = order && keys.length === 1 && keys[0] === "symbols";
            const ignoredPaylines = keys[0] === "paylines" && [left, right].every((snapshot) => {
                const type = valueAt(snapshot.effective, ["winModel", "type"]);
                return type.present && (type.value === "ways" || type.value === "clusters");
            });
            const unknown = [left, right].some((snapshot) =>
                definitionFieldAuthority(snapshot.fields, keys)?.status === "unsupported");
            const mathematical =
                !unknown &&
                !descriptiveModeField &&
                !inventoryOrder &&
                !ignoredPaylines &&
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
                    !representation,
                ),
                after: side(
                    right,
                    b === undefined ? {present: false} : {present: true, value: b as DefinitionJson},
                    keys,
                    !representation,
                ),
            });
        };
        walk(leftModel, rightModel, []);
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
        // Provenance belongs to retained declarations, not the normalized reel representation.
        // Include recorded omissions without constructing any effective value for them.
        const visited = new Set<string>();
        const provenance = (keys: string[]): void => {
            const identity = JSON.stringify(keys);
            if (visited.has(identity)) return;
            visited.add(identity);
            const before = valueAt(left.effective, keys);
            const after = valueAt(right.effective, keys);
            const beforeValue = before.present ? before.value : undefined;
            const afterValue = after.present ? after.value : undefined;
            const container = (isRecord(beforeValue) && isRecord(afterValue)) ||
                (Array.isArray(beforeValue) && Array.isArray(afterValue));
            const childKeys = [...new Set([
                ...Object.keys(beforeValue !== null && typeof beforeValue === "object" ? beforeValue : {}),
                ...Object.keys(afterValue !== null && typeof afterValue === "object" ? afterValue : {}),
            ])].sort();
            for (const key of childKeys) provenance([...keys, key]);
            const path = keys.length ? "/" + keys.map(definitionPointerPart).join("/") : "";
            if (
                (before.present !== after.present || (!container && canonicalDefinitionJson(beforeValue) !== canonicalDefinitionJson(afterValue))) ||
                changes.some(
                    (change) =>
                        change.path === path ||
                        (change.classification !== "provenance" && (
                            path.startsWith(change.path + "/") ||
                            (!container && change.path.startsWith(path + "/")))),
                )
            ) return;
            const a = side(left, before, keys);
            const b = side(right, after, keys);
            // A child representation change already discloses adding/removing the declaration.
            // Independent container authority changes still need their own precise path.
            if (container && a.provenance.authored.present !== b.provenance.authored.present &&
                changes.some(change => change.classification === "representation" && change.path.startsWith(path + "/"))) return;
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
        for (const field of [...left.fields, ...right.fields]) {
            const keys = modelFieldPathSegments(field.path);
            if (keys) provenance(keys);
        }
        const diagnostics = (snapshot: MathDefinitionSnapshot): Map<string, DefinitionJson[]> => {
            const groups = new Map<string, DefinitionJson[]>();
            if (snapshot.advanced) {
                const {checks, ...summary} = snapshot.advanced;
                groups.set("/validation/advanced/report", [summary as unknown as DefinitionJson]);
                for (const check of checks) {
                    const path = `/validation/advanced/${definitionPointerPart(check.path)}/${definitionPointerPart(check.id)}`;
                    const group = groups.get(path) ?? [];
                    group.push(check as unknown as DefinitionJson);
                    groups.set(path, group);
                }
            }
            for (const issue of snapshot.diagnostics) {
                const path = `/validation/${definitionPointerPart(issue.path)}/${definitionPointerPart(issue.code)}`;
                const group = groups.get(path) ?? [];
                group.push(issue as unknown as DefinitionJson);
                groups.set(path, group);
            }
            return groups;
        };
        const leftDiagnostics = diagnostics(left);
        const rightDiagnostics = diagnostics(right);
        const a = new Map<string, DefinitionJson>();
        const b = new Map<string, DefinitionJson>();
        for (const path of [...new Set([...leftDiagnostics.keys(), ...rightDiagnostics.keys()])].sort()) {
            const before = leftDiagnostics.get(path) ?? [];
            const after = rightDiagnostics.get(path) ?? [];
            const multiple = before.length > 1 || after.length > 1;
            for (const [values, target] of [[before, a], [after, b]] as const) for (const issue of values) {
                // A colliding path/code cannot identify a particular issue. Use its complete,
                // deterministic identity instead of guessing which message was edited.
                const key = multiple ? `${path}/${definitionPointerPart(canonicalDefinitionJson(issue))}` : path;
                target.set(key, issue);
            }
        }
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
        if (!left.advanced || !right.advanced) status = "partial";
        if ([left, right].some(source => source.advanced && source.advanced.verdict === "inconclusive")) status = "partial";
        if ([left, right].some(source => source.advanced?.verdict === "violated")) status = "invalid";
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

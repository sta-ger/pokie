import type {ReelSequenceStatistics} from "../session/videoslot/combinations/WeightedSequenceVariant.js";

export type ReelSequenceModelChange = {
    reelIndex: number;
    kind: "availability" | "added" | "removed" | "order" | "weight" | "symbols" | "context" | "model";
    path: string;
    left: unknown;
    right: unknown;
};
export type ReelSequencesDiff = {
    changed: boolean;
    configuredChanged: boolean;
    observationsChanged: boolean;
    changes: ReelSequenceModelChange[];
    left: readonly ReelSequenceStatistics[] | null;
    right: readonly ReelSequenceStatistics[] | null;
};

/** Model edits are separate from sampling differences; old reports remain comparable. */
export function diffReelSequences(
    left?: readonly ReelSequenceStatistics[],
    right?: readonly ReelSequenceStatistics[],
): ReelSequencesDiff | undefined {
    if (left === undefined && right === undefined) return undefined;
    const changes: ReelSequenceModelChange[] = [];
    const equal = (a: unknown, b: unknown): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
    let observationsChanged = false;
    for (const reelIndex of new Set([
        ...(left ?? []).map((reel) => reel.reelIndex),
        ...(right ?? []).map((reel) => reel.reelIndex),
    ])) {
        const a = left?.find((reel) => reel.reelIndex === reelIndex),
            b = right?.find((reel) => reel.reelIndex === reelIndex);
        const add = (kind: ReelSequenceModelChange["kind"], path: string, before: unknown, after: unknown): void => {
            if (!equal(before, after)) changes.push({reelIndex, kind, path, left: before ?? null, right: after ?? null});
        };
        if (!a || !b) {
            add("availability", "reelSequences", a, b);
            continue;
        }
        add("context", "context", a.context, b.context);
        add(
            "order",
            "variants.order",
            a.variants.map((v) => v.id),
            b.variants.map((v) => v.id),
        );
        for (const id of new Set([...a.variants.map((v) => v.id), ...b.variants.map((v) => v.id)])) {
            const av = a.variants.find((v) => v.id === id),
                bv = b.variants.find((v) => v.id === id);
            if (!av || !bv) add(
                av ? "removed" : "added",
                `variants[${JSON.stringify(id)}]`,
                av && {id, weight: av.weight},
                bv && {id, weight: bv.weight},
            );
            else add("weight", `variants[${JSON.stringify(id)}].weight`, av.weight, bv.weight);
        }
        const am = readModel(a.model),
            bm = readModel(b.model);
        if (am && bm) {
            for (const key of new Set([...Object.keys(am), ...Object.keys(bm)])) {
                if (key !== "reels") add(
                    key === "context" || key === "sampling" ? "context" : "model",
                    `model.${key}`,
                    am[key],
                    bm[key],
                );
            }
            const ar = Array.isArray(am.reels) ? am.reels : [],
                br = Array.isArray(bm.reels) ? bm.reels : [];
            for (let i = 0; i < Math.max(ar.length, br.length); i++) {
                const as = ar[i],
                    bs = br[i];
                // Weighted models embed complete variants; compare symbols by stable ID so order and
                // weight edits above are not mislabeled as symbol changes.
                if (Array.isArray(as) && Array.isArray(bs) && as.every(isVariant) && bs.every(isVariant)) {
                    add(
                        "order",
                        `model.reels[${i}].variants.order`,
                        as.map((v) => v.id),
                        bs.map((v) => v.id),
                    );
                    for (const id of new Set([...as.map((v) => v.id), ...bs.map((v) => v.id)])) {
                        const av = as.find((v) => v.id === id),
                            bv = bs.find((v) => v.id === id);
                        if (!av || !bv) add(av ? "removed" : "added", `model.reels[${i}].variants[${JSON.stringify(id)}]`, av, bv);
                        else add(
                            "weight",
                            `model.reels[${i}].variants[${JSON.stringify(id)}].weight`,
                            av.weight,
                            bv.weight,
                        );
                        add(
                            "symbols",
                            `model.reels[${i}].variants[${JSON.stringify(id)}].symbols`,
                            as.find((v) => v.id === id)?.symbols,
                            bs.find((v) => v.id === id)?.symbols,
                        );
                    }
                } else add("symbols", `model.reels[${i}]`, as, bs);
            }
        } else add("model", "model.identity", a.model, b.model);
        observationsChanged ||= !equal(
            {
                selections: a.selections,
                counts: a.variants
                    .filter((v) => v.count > 0)
                    .map(({id, count}) => ({id, count}))
                    .sort((x, y) => x.id.localeCompare(y.id)),
            },
            {
                selections: b.selections,
                counts: b.variants
                    .filter((v) => v.count > 0)
                    .map(({id, count}) => ({id, count}))
                    .sort((x, y) => x.id.localeCompare(y.id)),
            },
        );
    }
    if ((left === undefined) !== (right === undefined) && changes.length === 0) changes.push({
        reelIndex: -1,
        kind: "availability",
        path: "reelSequences",
        left: left ?? null,
        right: right ?? null,
    });
    return {
        changed: changes.length > 0 || observationsChanged,
        configuredChanged: changes.length > 0,
        observationsChanged,
        changes,
        left: left ?? null,
        right: right ?? null,
    };
}

function readModel(model: string): Record<string, unknown> | undefined {
    try {
        const parsed: unknown = JSON.parse(model);
        return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : undefined;
    } catch {
        return undefined;
    }
}
function isVariant(value: unknown): value is {id: string; symbols: unknown; weight?: unknown} {
    return !!value && typeof value === "object" && "id" in value && typeof value.id === "string";
}
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(
        Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
    );
    return value;
}

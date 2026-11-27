type Evaluation = {
    parameters: Record<string, number | string>;
    measured?: number[];
};

// Paytable payouts are allowed to be decimal (the field itself says so), unlike counts such as free
// games or match counts. When every evaluated payout happened to be an integer, rounding the
// interpolated value back to an integer can land on a value that was already measured and hide the
// actually reachable decimal between two candidates (for example 95% between payout 7 and 8).
function allowsDecimalValue(path: string): boolean {
    return (/^\/paytable\/[^/]+\/\d+$/).test(path);
}

/**
 * Estimate the next value of a single tunable field that would hit an exact target, using the
 * candidate evaluations the caller already has. This is deliberately only a hint: the estimate is
 * linear between measured candidates, so the UI must still ask for an exact re-run. Returns undefined
 * for multi-field or non-numeric cases where a one-dimensional estimate would be misleading.
 *
 * Integer-only fields keep an integer suggestion. Paytable payouts fall back to a two-decimal value
 * when the nearest integer has already been evaluated -- that is the case where the old hint vanished
 * exactly when it was most useful.
 */
export function suggestNextTunableValue(
    path: string,
    target: number,
    evaluations: readonly Evaluation[],
): {value: number; integer: boolean} | undefined {
    const points: {x: number; y: number}[] = [];
    for (const evaluation of evaluations) {
        const rawX = evaluation.parameters[path];
        const x = typeof rawX === "number" ? rawX : Number(rawX);
        const y = evaluation.measured?.[0];
        if (!Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) continue;
        points.push({x, y});
    }
    points.sort((left, right) => left.x - right.x);
    const unique = points.filter((point, index) => index === 0 || point.x !== points[index - 1]!.x);
    if (unique.length < 2) return undefined;

    // Prefer the adjacent pair that straddles the target; otherwise extrapolate from the nearest end.
    let pair = unique.slice(-2);
    for (let index = 1; index < unique.length; index++) {
        const left = unique[index - 1]!;
        const right = unique[index]!;
        if ((left.y - target) * (right.y - target) <= 0) {
            pair = [left, right];
            break;
        }
    }
    if (target < unique[0]!.y) pair = [unique[0]!, unique[1]!];
    const [left, right] = pair;
    const slope = (right.y - left.y) / (right.x - left.x);
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-12) return undefined;
    const rawValue = left.x + (target - left.y) / slope;
    if (!Number.isFinite(rawValue) || rawValue <= 0) return undefined;

    const allInteger = unique.every((point) => Number.isInteger(point.x));
    if (allInteger) {
        const rounded = Math.round(rawValue);
        if (!unique.some((point) => point.x === rounded)) return {value: rounded, integer: true};
        if (!allowsDecimalValue(path)) return undefined;
    }
    const decimal = Math.round(rawValue * 100) / 100;
    if (unique.some((point) => point.x === decimal)) return undefined;
    return {value: decimal, integer: false};
}

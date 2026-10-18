function gcd(left: bigint, right: bigint): bigint {
    while (right) [left, right] = [right, left % right];
    return left;
}
/** Seeded permutation with O(1) memory; no duplicate candidates, no completion-order dependence. */
export function optimizationOrder(startHash: string, strideHash: string, size: bigint): {start: bigint; stride: bigint} {
    const start = BigInt(`0x${startHash.slice(7)}`) % size;
    let stride = BigInt(`0x${strideHash.slice(7)}`) % size || BigInt(1);
    while (gcd(stride, size) !== BigInt(1)) stride++;
    return {start, stride};
}

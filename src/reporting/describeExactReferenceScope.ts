/**
 * One plain-language scope/note pair for an exact-math reference in a simulation report.
 * Shared by the Markdown and HTML renderers so both say the same thing about paid-spin-only
 * libraries and libraries whose feature-trigger scope could not be inspected.
 */
export function describeExactReferenceScope(featurePayoutsIncluded: boolean | undefined): {scope: string; note: string} {
    if (featurePayoutsIncluded === false) {
        return {
            scope: "Exact paid-spin reference (feature payouts not included)",
            note: "Exact math covers paid entry spins only; later feature payouts are outside it. Use Simulation for total RTP.",
        };
    }
    if (featurePayoutsIncluded === undefined) {
        return {
            scope: "Exact paid-spin reference (scope not inspected)",
            note: "This library was too large to inspect feature triggers here. If the design has feature payouts, treat this as a paid-spin reference only.",
        };
    }
    return {
        scope: "Exact for this saved design",
        note: "Exact math is the reference; simulation is an estimate.",
    };
}

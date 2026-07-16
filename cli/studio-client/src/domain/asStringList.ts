// Read-only helper for pulling a string[] out of an untyped blueprint field for display (e.g.
// populating a symbol <select>) -- ported verbatim from the old dom.ts's asStringList. Mutations still
// go exclusively through blueprintFormOps.ts; this never writes anything.
export function asStringList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

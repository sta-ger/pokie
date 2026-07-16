// The single place every catch normalizes an unknown thrown value to display text -- ported verbatim
// from the old dom.ts (see tests/cli/studio-client/src/domain/errorMessage.test.ts).
export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

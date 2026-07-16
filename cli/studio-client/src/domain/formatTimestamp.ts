// The one place a raw timestamp (ISO string or epoch ms) becomes display text -- ported verbatim from
// the old dom.ts (see tests/cli/studio-client/src/domain/formatTimestamp.test.ts).
export function formatTimestamp(value: string | number): string {
    return new Date(value).toLocaleString();
}

// Pure and tiny on purpose: cli/pokie.ts itself can't be unit-tested directly (its
// readOwnVersion()/ownClientRoot()/ownStudioRoot() all need import.meta.url, which breaks under
// ts-jest's CommonJS transform — see that file's own comments). Extracting the one bit of dispatch
// logic that actually needs coverage — "no arguments means the studio command" — into its own pure
// function keeps that behavior testable without touching import.meta.url at all.
export function resolveCommandName(argv: string[]): string {
    return argv[2] ?? "studio";
}

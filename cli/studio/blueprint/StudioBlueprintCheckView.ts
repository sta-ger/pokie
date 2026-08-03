// POST /api/home/blueprints/check-source's own DTO — the Studio boundary a caller that already holds a
// loaded blueprint's own content hash (see StudioBlueprintLoadView.blueprintHash) uses to cheaply ask
// whether the persisted source at `path` has since changed on disk, without the caller re-fetching and
// diffing the full content itself first. "changed" carries the fresh blueprint/hash straight back (the
// exact same content load() would return for that path right now) so a caller that's just detected drift
// never needs a second round trip merely to see what changed. "load-error" mirrors load()'s own outcome
// for a path that's gone missing, stopped parsing, or resolves outside Studio's own internal directory in
// the meantime — always a safe message, never a stack trace.
export type StudioBlueprintCheckView =
    | {status: "unchanged"}
    | {status: "changed"; blueprint: unknown; blueprintHash: string}
    | {status: "load-error"; error: string};

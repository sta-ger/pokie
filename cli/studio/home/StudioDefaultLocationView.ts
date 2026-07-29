// The plain-data DTO GET /api/home/fs/default-location returns -- the last two rungs of a path field's
// start-location precedence ("platform Documents, then Home"; see PathInput/resolveBrowseStartLocation
// on the client), after the caller's own current-field-value/relevant-directory/remembered-location
// checks have already come up empty. Every non-"valid" outcome (invalid name, unusable/unresolved
// Documents *and* Home, an unsafe resolved path) collapses to "unavailable": a client picking a start
// location has nothing useful to do with *why* the platform default couldn't be computed, only whether
// one exists.
export type StudioDefaultLocationView = {status: "valid"; directory: string; source: "documents" | "home"} | {status: "unavailable"};

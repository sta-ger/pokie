// POST /api/home/blueprints/save-managed's own DTO -- the guided Design Game editor's "first Save"
// flow (see StudioBlueprintService.saveManaged's own doc comment): unlike /save, the caller never picks
// a path -- this always succeeds onto a path Studio itself chose, or reports why it couldn't. `name` is
// echoed back alongside `path` on "ok" so the caller (StudioServer's own route handler) can register the
// same entry in StudioProjectRegistry without re-deriving it from the blueprint a second time.
// "invalid-name"/"unavailable" mirror PokiePathResolver.resolveIndependentProjectDirectory's own
// unusable-default-location outcomes; "error" covers an fs failure once a usable directory was found.
export type StudioBlueprintSaveManagedView =
    | {status: "ok"; path: string; name: string}
    | {status: "invalid-name"; error: string}
    | {status: "unavailable"; error: string}
    | {status: "error"; error: string};

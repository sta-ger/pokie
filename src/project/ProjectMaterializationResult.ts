// What ProjectMaterializing.materialize() resolves to for a given PokieProject: where the materialized,
// loadable runtime now lives, and who is responsible for cleaning it up afterward. Materializing a project
// that's already runtime-shaped (a "tsPackage" project, say) can validly just hand back the project's own
// rootPath with no new artifacts created at all — "ownsRuntimePath: false" is how that case is told apart,
// at the type level, from one that allocated something new (e.g. building a "blueprint" project into a
// fresh temp directory) and now needs the caller to release it. release() is always safe to call regardless
// of ownsRuntimePath — a "borrowed" result's release() is a no-op, not something the caller has to guard
// with an ownsRuntimePath check first.
export type ProjectMaterializationResult = {
    readonly runtimePath: string;
    readonly ownsRuntimePath: boolean;
    release(): Promise<void>;
};

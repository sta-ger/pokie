import type {ProjectCapabilities, ProjectType} from "pokie";

// "managed" — POKIE itself created this project (Create/Init/Build from Home), living under the
// platform "POKIE Projects" convention (see PokiePathResolver.resolveIndependentProjectDirectory).
// "external" — a package/library/WASM target the user already has somewhere else, registered by its
// existing path (see StudioProjectRegistrationService.registerExternal) rather than copied in.
export type StudioProjectOrigin = "managed" | "external";

// One row of the Studio project registry — every project Studio knows about, managed or external,
// recorded the same way. `location`/`type`/`capabilities` are always exactly what ProjectResolving
// (ProjectTargetResolver, the same resolver `pokie sim`/`pokie build`/every migrated CLI command already
// crosses) reported for `location` at the moment this entry was written, never caller-asserted — see
// StudioProjectRegistrationService.register. `location` is the entry's own identity key: an absolute
// path to the file (blueprint/parWorkbook/wasm) or directory (tsPackage/outcomeLibrary/stakeAdapter) this
// project was resolved from, matching PokieProject.rootPath exactly. Deliberately carries no "status"
// field of its own — whether `location` still exists on disk can change between one list() call and the
// next without this entry ever being rewritten, so status is always computed fresh at read time (see
// StudioProjectRegistrationService.list), the same "never persist a fact that can go stale silently"
// choice StudioHomeService.listRecentProjects already makes for its own "missing" flag.
export type StudioProjectRegistryEntry = {
    readonly location: string;
    readonly name: string;
    readonly type: ProjectType;
    readonly capabilities: ProjectCapabilities;
    readonly origin: StudioProjectOrigin;
    readonly lastOpenedAt: string;
};

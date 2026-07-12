import type {PokieGameManifest} from "pokie";

// The Project Dashboard's own read model — richer than StudioContext (which only ever carries
// `projectRoot`, for routing). "empty" is the state when Studio is in Home mode (no active project
// to show a dashboard for at all); "loading" only ever happens right after Studio starts directly
// into Project mode (`pokie .`/`pokie <path>`/`pokie studio <path>`) and hasn't finished loading the
// entry module yet — Create/Open both already have the manifest in hand by the time they switch
// StudioServer into project mode, so they go straight to "loaded" (see StudioServer).
export type ProjectDashboardContext =
    | {status: "empty"}
    | {status: "loading"; projectRoot: string}
    | {status: "loaded"; projectRoot: string; game: PokieGameManifest}
    | {status: "error"; projectRoot: string; error: string};

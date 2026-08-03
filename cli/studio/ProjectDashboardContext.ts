import type {PokieGameManifest, ProjectType} from "pokie";
import type {StudioProjectOrigin} from "./StudioProjectRegistryEntry.js";

// The Project Dashboard's own read model — richer than StudioContext (which only ever carries
// `projectRoot`, for routing). "empty" is the state when Studio is in Home mode (no active project
// to show a dashboard for at all); "loading" only ever happens right after Studio starts directly
// into Project mode (`pokie .`/`pokie <path>`/`pokie studio <path>`) and hasn't finished loading the
// entry module yet — Create/Open both already have the manifest in hand by the time they switch
// StudioServer into project mode, so they go straight to "loaded" (see StudioServer).
//
// `type`/`capabilities`/`origin` describe the *original* project `projectRoot` resolved from (see
// StudioProjectRegistrationService.describeLocation) — not the materialized runtime `game` was
// actually loaded from, which for a "blueprint" project is a generated tsPackage, never the blueprint
// itself. Best-effort and independent of `game`: a resolver that can't identify `projectRoot` at all
// (or a location that was never registered, for `origin`) simply leaves these undefined rather than
// failing the whole load -- Overview treats their absence as "unknown", never as an error.
export type ProjectDashboardContext =
    | {status: "empty"}
    | {status: "loading"; projectRoot: string}
    | {
          status: "loaded";
          projectRoot: string;
          game: PokieGameManifest;
          type?: ProjectType;
          capabilities?: readonly string[];
          origin?: StudioProjectOrigin;
      }
    | {status: "error"; projectRoot: string; error: string};

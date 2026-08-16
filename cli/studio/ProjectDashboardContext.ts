import type {OutcomeSourceProjectReport, PokieGameManifest, PokieProject, ProjectType} from "pokie";
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
//
// "outcome-source" is the dedicated state for a resolved "outcomeLibrary"/"stakeAdapter" `projectRoot`
// -- neither type ever gains RUNTIME_EXECUTE_CAPABILITY (see ProjectCapabilities.ts), so there is no
// `game`/materialized runtime to load at all; loadProjectDashboardContext routes these straight through
// OutcomeSourceProjectAnalyzer instead of attempting (and permanently failing) the ordinary "loaded"
// path. `project` is the full resolved PokieProject (not just `type`/`capabilities`) so a caller (see
// StudioServer's own outcome-source sample route) can hand it straight to sampleOutcomeSourceProject
// without re-resolving it a second time.
//
// "artifact" is the corresponding non-runtime state for a resolved PAR workbook. A workbook has no
// game manifest or outcome-source reader, but it can be republished through Build/Export; routing it
// here keeps that capability reachable without ever trying to materialize it as a runtime package.
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
    | {
          status: "outcome-source";
          projectRoot: string;
          project: PokieProject;
          origin?: StudioProjectOrigin;
          report: OutcomeSourceProjectReport;
      }
    | {
          status: "artifact";
          projectRoot: string;
          project: PokieProject;
          origin?: StudioProjectOrigin;
      }
    // `errorDetail` carries a failure's own raw technical diagnostic text, kept separate from `error`'s
    // plain-English summary -- currently only populated from a BlueprintMaterializationError's own
    // "details" (a failed materialization "npm install"'s real stderr; see that class's own doc comment
    // for why it's never folded into the primary message), so a client can offer it as expandable detail
    // rather than always rendering a wall of npm output as the primary failure message.
    | {status: "error"; projectRoot: string; error: string; errorDetail?: string};

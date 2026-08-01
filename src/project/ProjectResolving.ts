import type {PokieProject} from "./PokieProject.js";

// The single runtime boundary a caller crosses from "a path on disk" to "a resolved, typed PokieProject" —
// what every command/service should call instead of independently sniffing a path's own extension or
// directory contents. Always a Promise, even for a resolution that only ever does synchronous fs work today,
// so a future implementation (e.g. one that also needs to probe a remote registry for a "stakeAdapter"
// project) can be swapped in without changing this contract. Never throws for a path that simply doesn't
// resolve to any known ProjectType — that's an undefined return, not an error; only a genuine I/O failure
// (e.g. the given path's own parent directory not existing) propagates. Two other exceptions: an
// implementation that recognizes a target as more than one ProjectType at once (a registration/recognition
// conflict, not a normal non-match) throws rather than silently picking a winner, and a target that looks
// like a specific-but-not-yet-supported ProjectType (e.g. an ordinary .wasm file — POKIE has no versioned
// WASM export contract yet) throws an explicit unsupported-target error rather than reporting undefined —
// see ProjectTargetResolver/ProjectTargetAmbiguousError/ProjectTargetUnsupportedError.
export interface ProjectResolving {
    resolve(targetPath: string): Promise<PokieProject | undefined>;
}

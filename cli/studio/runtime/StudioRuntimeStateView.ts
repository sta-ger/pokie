// GET /api/project/runtime's own DTO — also what POST .../start, .../stop, and .../restart resolve to
// once settled. "starting"/"stopping" are only ever observed transiently (StudioRuntimeManager's own
// start()/stop() await the underlying PokieDevServer's start()/stop() promise before returning), but
// are still modeled explicitly per the task's lifecycle list rather than collapsed into stopped/running.
export type StudioRuntimeStateView =
    | {status: "stopped"}
    | {status: "starting"}
    | {
          status: "running";
          host: string;
          port: number;
          baseUrl: string;
          // Where the exact same canonical player `pokie dev`/`pokie client` open (see
          // StudioRuntimeManager's own doc comment) is reachable for this runtime instance -- backs the
          // Runtime tab's "Open Player" action. A real, independently-listening PokieClientServer, not a
          // route on this Studio server itself, so opening it is byte-for-byte the same player surface
          // (and the same connection/error/retry adapter) as `pokie dev`/`pokie client` already serve.
          playerUrl: string;
          debug: boolean;
          repositoryMode: "memory" | "file";
          startedAt: string;
          // Present exactly when this runtime was started with a pre-generated outcome library (see
          // ValidatedStartRuntimeRequest.preGeneratedLibrarySelector) -- the Runtime tab's own
          // confirmation that the Outcome Libraries handoff actually took effect, not a manual
          // instruction the user has to act on themselves.
          preGenerated?: {libraryId: string; hash: string};
      }
    | {status: "stopping"}
    | {status: "failed"; error: string};

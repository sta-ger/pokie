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
          debug: boolean;
          repositoryMode: "memory" | "file";
          startedAt: string;
      }
    | {status: "stopping"}
    | {status: "failed"; error: string};

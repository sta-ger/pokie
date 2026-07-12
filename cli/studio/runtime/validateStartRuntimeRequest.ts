export type StartRuntimeRequestInput = {
    host?: unknown;
    port?: unknown;
    debug?: unknown;
    seed?: unknown;
    repositoryMode?: unknown;
};

export type ValidatedStartRuntimeRequest = {
    host?: string;
    port?: number;
    debug: boolean;
    seed?: string | number;
    repositoryMode: "memory" | "file";
};

// The one place a POST /api/project/runtime/start (or .../restart) body is turned into a trusted
// request — throws a plain, client-safe Error (StudioServer catches this and maps it to 400) for
// anything malformed. Every field is optional: an empty body is a valid "start with defaults" request
// (host/port left to PokieDevServer's own defaults, debug off, memory-mode sessions, no seed).
export function validateStartRuntimeRequest(input: StartRuntimeRequestInput): ValidatedStartRuntimeRequest {
    const {host, port, debug, seed, repositoryMode} = input;

    if (host !== undefined && (typeof host !== "string" || host.trim().length === 0)) {
        throw new Error('"host" must be a non-empty string when given.');
    }
    if (port !== undefined && (typeof port !== "number" || !Number.isInteger(port) || port < 0)) {
        throw new Error('"port" must be a non-negative integer when given (0 lets the OS assign a free port).');
    }
    if (debug !== undefined && typeof debug !== "boolean") {
        throw new Error('"debug" must be a boolean when given.');
    }
    if (seed !== undefined && typeof seed !== "string" && typeof seed !== "number") {
        throw new Error('"seed" must be a string or number when given.');
    }
    if (repositoryMode !== undefined && repositoryMode !== "memory" && repositoryMode !== "file") {
        throw new Error('"repositoryMode" must be "memory" or "file" when given.');
    }

    return {
        host: host as string | undefined,
        port: port as number | undefined,
        debug: debug === true,
        seed: seed as string | number | undefined,
        repositoryMode: (repositoryMode as "memory" | "file" | undefined) ?? "memory",
    };
}

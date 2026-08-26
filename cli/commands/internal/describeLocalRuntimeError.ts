// Keeps the three local-runtime commands' actionable startup/load diagnostics in one place. These
// commands deliberately expose the same local HTTP workflow, so their recovery guidance must not
// drift as their individual server wiring evolves.
export function describeLocalServerStartError(
    error: unknown,
    listenerName: string,
    portOption: "--port" | "--client-port",
): Error {
    const candidate = error as NodeJS.ErrnoException & {address?: unknown; port?: unknown};
    if (candidate?.code !== "EADDRINUSE") {
        return asError(error);
    }

    const host = typeof candidate.address === "string" ? candidate.address : "the configured host";
    const port = typeof candidate.port === "number" ? candidate.port : "the configured port";
    return new Error(
        `${listenerName} could not listen on ${host}:${port} because that address is already in use. ` +
            `Stop the process using it, or retry with ${portOption} <number> (or ${portOption} 0 for an available port).`,
    );
}

export function describeRuntimePackageLoadError(packageRoot: string, error: unknown): Error {
    return new Error(
        `Could not load a POKIE game package from ${JSON.stringify(packageRoot)}. ` +
            `Run \`pokie validate ${JSON.stringify(packageRoot)}\` to diagnose the package, then retry. ` +
            `Details: ${asError(error).message}`,
    );
}

function asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

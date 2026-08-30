// Keeps the three local-runtime commands' actionable startup/load diagnostics in one place. These
// commands deliberately expose the same local HTTP workflow, so their recovery guidance must not
// drift as their individual server wiring evolves.
import {ProjectTargetMalformedError, ProjectTargetUnsupportedError} from "pokie";
import {RuntimePreparationError} from "../../materialize/RuntimePreparationError.js";

export function describeLocalServerStartError(
    error: unknown,
    listenerName: string,
    portOption: "--port" | "--client-port",
): Error {
    const candidate = error as NodeJS.ErrnoException & {address?: unknown; port?: unknown};
    if (candidate?.code === "EADDRINUSE") {
        const host = typeof candidate.address === "string" ? candidate.address : "the configured host";
        const port = typeof candidate.port === "number" ? candidate.port : "the configured port";
        return new Error(
            `${listenerName} could not listen on ${host}:${port} because that address is already in use. ` +
                `Stop the process using it, or retry with ${portOption} <number> (or ${portOption} 0 for an available port).`,
        );
    }

    return new Error(
        `${listenerName} could not start its local listener. Check the configured host and port, then retry with ` +
            `${portOption} <number> (or ${portOption} 0 for an available port).`,
    );
}

export function describeRuntimePackageLoadError(packageRoot: string, error: unknown): Error {
    if (error instanceof ProjectTargetMalformedError && error.targetType === "parWorkbook") {
        return RuntimePreparationError.parWorkbookRecognition(packageRoot, error);
    }
    // A .wasm path has its own inspection-only resolver boundary.  In
    // particular, a missing, malformed, or incompatible sidecar is not a
    // package.json problem, and runtime preparation must not erase its exact
    // repair action while trying to load a game.
    if (
        (error instanceof ProjectTargetMalformedError || error instanceof ProjectTargetUnsupportedError) &&
        error.targetType === "wasm"
    ) return error;
    // Planner/materialization errors already name the attempted runtime path
    // and exact failed stage. Replacing them with package-validation advice is
    // actively misleading for a valid Blueprint or PAR workbook.
    if (error instanceof Error && (
        error.name === "UnsupportedProjectOperationError" ||
        error.name === "BlueprintMaterializationError" ||
        error.name === "RuntimePreparationError" ||
        error.message.startsWith("Cannot prepare a runnable runtime") ||
        error.message.includes("Runtime materialization was cancelled")
    )) return error;
    return new Error(
        `Could not load a POKIE game package from ${JSON.stringify(packageRoot)}. ` +
            `Run \`pokie validate ${JSON.stringify(packageRoot)}\` to diagnose the package, then retry.`,
    );
}

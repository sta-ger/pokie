import fs from "fs";
import path from "path";

/**
 * Turn a wrong `--mode` value into the bundle's own mode list instead of the raw ENOENT from
 * `index_<mode>.json`. A native Outcome Library is a folder whose index.json declares every mode;
 * sim/replay/sample/serve all require one of those names.
 */
export async function assertDeclaredOutcomeLibraryMode(libraryDir: string, modeName: string): Promise<void> {
    const indexPath = path.join(libraryDir, "index.json");
    let parsed: unknown;
    try {
        parsed = JSON.parse(await fs.promises.readFile(indexPath, "utf-8"));
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Could not read the Outcome Library index at "${indexPath}": ${detail} ` +
                `Run \`pokie validate ${JSON.stringify(libraryDir)}\` to diagnose the bundle, then retry.`,
        );
    }
    const declared = (parsed as {modes?: unknown})?.modes;
    const modes = Array.isArray(declared)
        ? declared
            .map((entry) => (typeof entry === "object" && entry !== null ? (entry as {modeName?: unknown}).modeName : undefined))
            .filter((name): name is string => typeof name === "string" && name.length > 0)
        : [];
    if (modes.includes(modeName)) return;
    const available = modes.length === 0
        ? "The index declares no usable modes."
        : `Available modes: ${modes.map((name) => JSON.stringify(name)).join(", ")}.`;
    throw new Error(
        `Mode "${modeName}" is not declared by the Outcome Library at "${libraryDir}". ${available} ` +
            "Choose one of them with --mode <modeName>.",
    );
}

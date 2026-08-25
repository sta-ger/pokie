import {CliCommandHandling} from "./CliCommandHandling.js";
import {BlueprintMaterializationError} from "./materialize/BlueprintMaterializationError.js";
import {GamePackagePreparationError} from "./prepare/GamePackagePreparationError.js";
import {isTopLevelHelpRequest, isTopLevelVersionRequest, resolveCliInvocation} from "./resolveCliInvocation.js";
import {buildUsageText} from "./usageText.js";

function printUsage(commands: CliCommandHandling[]): void {
    console.log(buildUsageText(commands));
}

function printFirstContact(commands: CliCommandHandling[]): void {
    console.log(
        "POKIE builds server-side video-slot games for Node.js and TypeScript.\n\n" +
            "Start a new ready-to-run game:\n" +
            "  pokie init <directory>\n\n" +
            "Or design an editable Blueprint Project first:\n" +
            "  pokie create <name>\n",
    );
    printUsage(commands);
}

function distance(left: string, right: string): number {
    const previous = Array.from({length: right.length + 1}, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        let diagonal = previous[0];
        previous[0] = leftIndex;
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            const above = previous[rightIndex];
            previous[rightIndex] = Math.min(
                previous[rightIndex] + 1,
                previous[rightIndex - 1] + 1,
                diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
            );
            diagonal = above;
        }
    }
    return previous[right.length];
}

function suggestedCommand(input: string, commands: CliCommandHandling[]): string | undefined {
    const publicCommands = commands.filter((command) => !command.getName().startsWith("__"));
    const nearest = publicCommands
        .map((command) => ({name: command.getName(), distance: distance(input.toLowerCase(), command.getName().toLowerCase())}))
        .sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name))[0];
    if (!nearest || nearest.distance > (input.length <= 4 ? 1 : 2)) {
        return undefined;
    }
    return nearest.name;
}

function printUnknownCommand(input: string, commands: CliCommandHandling[]): void {
    const suggestion = suggestedCommand(input, commands);
    const nextStep = suggestion === undefined ? "Run `pokie --help` to list commands." : `Did you mean \`${suggestion}\`? Run \`pokie ${suggestion} --help\` for usage.`;
    console.error(`Unknown command ${JSON.stringify(input)}. ${nextStep}`);
}

// The real top-level dispatch logic behind the `pokie` binary: resolve argv against the given
// commands (see resolveCliInvocation for the full precedence), run the matched command, and map
// its result/thrown error to a process exit code. cli/pokie.ts's run() is a thin wrapper around
// this function — it only builds the real `commands` array (readOwnVersion()/ownClientRoot()/
// ownStudioRoot() all need import.meta.url, so that construction has to stay there) and calls
// dispatch(commands, process.argv). Kept here, rather than inline in pokie.ts, so
// tests/cli/cliCommandInventory.contract.test.ts can exercise the real dispatcher mechanics —
// --help/-h, an unknown command, stdout/stderr separation, exit codes — without pokie.ts's own
// module-body `run().then(...)` call, which fires unconditionally on import (see pokie.ts's own
// comments on why it can't be imported directly in a test).
//
// This is deliberately Commander-free: resolveCliInvocation() already resolves which registered
// command owns a given argv (including "studio"'s own implicit-project-root precedence), so all
// that's left here is a plain lookup by name. The actual CLI argument/option adapter — declaring
// each public command's own positionals/options/aliases via Commander and validating them — lives on
// each CliCommandHandling itself (see e.g. cli/commands/BuildCommand.ts's own run()), not here; a
// second, dispatch-level Commander program would only ever re-forward tokens it can't itself
// interpret without duplicating that per-command schema.
export async function dispatch(commands: CliCommandHandling[], argv: string[], version?: string): Promise<number> {
    // Asked for the CLI's own help: print the same command list the unknown-command fallback
    // prints, but as a successful outcome (exit 0) — the user got exactly what they asked for.
    // Checked before resolveCliInvocation so these flags never reach StudioCommand; see
    // isTopLevelHelpRequest.
    if (isTopLevelHelpRequest(argv)) {
        printUsage(commands);
        return 0;
    }

    if (isTopLevelVersionRequest(argv)) {
        console.log(version ?? "unknown");
        return 0;
    }

    if (argv.length === 2) {
        printFirstContact(commands);
        return 0;
    }

    // "pokie ." / "pokie <existing path>", and every explicit command name are all resolved here
    // rather than inline — see
    // resolveCliInvocation's own doc comment for the full precedence. An unrecognized token that
    // isn't an existing path either falls through to the usage printout below, same as before.
    const invocation = resolveCliInvocation(
        argv,
        commands.map((candidate) => candidate.getName()),
    );
    if (!invocation) {
        printUnknownCommand(argv[2], commands);
        return 1;
    }

    // Always found in practice: resolveCliInvocation only ever names "studio" or a name it
    // confirmed is one of the knownCommandNames it was given. The check stays explicit rather than
    // a non-null assertion so this file makes no assumption about that invariant.
    const command = commands.find((candidate) => candidate.getName() === invocation.commandName);
    if (!command) {
        printUsage(commands);
        return 1;
    }

    try {
        const exitCode = await command.run(invocation.args);
        return exitCode ?? 0;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        // A BlueprintMaterializationError's or GamePackagePreparationError's own "details" (a failed
        // "npm install"'s raw npm stderr) is deliberately never folded into the human-readable message
        // above -- printed here, after it and clearly labeled, so the human explanation always leads and
        // the technical output stays a secondary, skippable block rather than the first thing a reader
        // hits. Both error types share this same "details" convention (see their own doc comments) --
        // Blueprint materialization and "pokie init" share one dependency-install mechanism
        // (withLocalPokieInstall), so their failures are surfaced identically here too.
        if ((error instanceof BlueprintMaterializationError || error instanceof GamePackagePreparationError) && error.details !== undefined) {
            console.error(`\nnpm output:\n${error.details}`);
        }
        return 1;
    }
}

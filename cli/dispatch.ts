import {CliCommandHandling} from "./CliCommandHandling.js";
import {isTopLevelHelpRequest, resolveCliInvocation} from "./resolveCliInvocation.js";
import {buildUsageText} from "./usageText.js";

function printUsage(commands: CliCommandHandling[]): void {
    console.log(buildUsageText(commands));
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
export async function dispatch(commands: CliCommandHandling[], argv: string[]): Promise<number> {
    // Asked for the CLI's own help: print the same command list the unknown-command fallback
    // prints, but as a successful outcome (exit 0) — the user got exactly what they asked for.
    // Checked before resolveCliInvocation so these flags never reach StudioCommand; see
    // isTopLevelHelpRequest.
    if (isTopLevelHelpRequest(argv)) {
        printUsage(commands);
        return 0;
    }

    // No arguments at all, "pokie ." / "pokie <existing path>", and every explicit command name
    // (including "studio" itself) are all resolved here rather than inline — see
    // resolveCliInvocation's own doc comment for the full precedence. An unrecognized token that
    // isn't an existing path either falls through to the usage printout below, same as before.
    const invocation = resolveCliInvocation(
        argv,
        commands.map((candidate) => candidate.getName()),
    );
    if (!invocation) {
        printUsage(commands);
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
        return 1;
    }
}

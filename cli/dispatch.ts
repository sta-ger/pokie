import {Command} from "commander";
import {CliCommandHandling} from "./CliCommandHandling.js";
import {isTopLevelHelpRequest, resolveCliInvocation} from "./resolveCliInvocation.js";
import {buildUsageText} from "./usageText.js";

function printUsage(commands: CliCommandHandling[]): void {
    console.log(buildUsageText(commands));
}

// Builds the Commander program that actually routes an already-resolved {commandName, args} (see
// resolveCliInvocation) to the matching CliCommandHandling's own run() — this is what replaces the
// old manual `commands.find(candidate => candidate.getName() === invocation.commandName)` lookup.
// Each command is registered as a passthrough subcommand: a single variadic positional plus
// allowUnknownOption()/allowExcessArguments() so Commander forwards its args verbatim, in order,
// exactly as the hand-rolled `argv.slice(...)` it replaces did — Commander never re-parses or
// validates a single one of those tokens itself; that stays entirely the domain command class's own
// job (see each cli/commands/*.ts's own parseArgs()). helpOption(false) on every subcommand keeps
// Commander from intercepting a command's own "--help"/"-h" (e.g. "pokie build --help" must still
// reach BuildCommand.run(["--help"]) unchanged — see isTopLevelHelpRequest's own doc comment on why
// only the CLI's *own* --help/-h is special-cased, before this program ever runs).
function buildDispatchProgram(commands: CliCommandHandling[], recordExitCode: (exitCode: number) => void): Command {
    const program = new Command("pokie").helpOption(false).addHelpCommand(false).exitOverride();

    for (const command of commands) {
        program
            .command(command.getName())
            .helpOption(false)
            .allowUnknownOption()
            .allowExcessArguments()
            .argument("[args...]")
            .action(async (args: string[]) => {
                const exitCode = await command.run(args);
                recordExitCode(exitCode ?? 0);
            });
    }

    return program;
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

    let exitCode = 0;
    const program = buildDispatchProgram(commands, (resolvedExitCode) => {
        exitCode = resolvedExitCode;
    });

    try {
        // invocation.commandName is always "studio" or one of the knownCommandNames resolveCliInvocation
        // was given, so this always matches one of the subcommands just registered above.
        await program.parseAsync(["node", "pokie", invocation.commandName, ...invocation.args]);
        return exitCode;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
    }
}

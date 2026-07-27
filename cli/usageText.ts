import {Command} from "commander";
import type {CliCommandHandling} from "./CliCommandHandling.js";

// The text behind both "pokie --help"/"pokie -h" (exit 0) and the unknown-command fallback
// (exit 1) — the exit code is the caller's decision in cli/pokie.ts, the text is the same either
// way. Kept as a pure string-returning function rather than console.log-ing directly so it can be
// asserted on directly, without capturing stdout. Built from a throwaway Commander program (never
// parsed/executed — see dispatch.ts for the program that actually dispatches) purely to reuse
// Commander's own Help formatting (visibleCommands/subcommandTerm/subcommandDescription) instead
// of a hand-rolled column-width calculation.
export function buildUsageText(commands: CliCommandHandling[]): string {
    const program = new Command("pokie").helpOption(false).addHelpCommand(false);
    for (const command of commands) {
        program.command(command.getName()).description(command.getDescription());
    }

    program.configureHelp({
        subcommandTerm: (command) => command.name(),
        formatHelp: (topLevel, helper) => {
            const registered = helper.visibleCommands(topLevel);
            // Widened to the longest registered name instead of a fixed column, so a long command
            // ("outcomelibrary", "certification") doesn't push its own description out of alignment
            // with every other row.
            const nameColumnWidth = registered.reduce((widest, command) => Math.max(widest, helper.subcommandTerm(command).length), 0);

            const lines = ["Usage: pokie <command>", "", "Commands:"];
            for (const command of registered) {
                lines.push(`  ${helper.subcommandTerm(command).padEnd(nameColumnWidth)}  ${helper.subcommandDescription(command)}`);
            }
            return lines.join("\n");
        },
    });

    return program.helpInformation();
}

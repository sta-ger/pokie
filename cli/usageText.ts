import {Command} from "commander";
import type {CliCommandHandling} from "./CliCommandHandling.js";

// The text behind both "pokie --help"/"pokie -h" (exit 0) and the unknown-command fallback
// (exit 1) — the exit code is the caller's decision in cli/pokie.ts, the text is the same either
// way. Kept as a pure string-returning function rather than console.log-ing directly so it can be
// asserted on directly, without capturing stdout. Built from a throwaway Commander program (never
// parsed/executed — see dispatch.ts for the program that actually dispatches) and rendered entirely
// by Commander's own default Help formatter (helpInformation()) — column widths, wrapping, and the
// "Commands:" section are all Commander's, not a hand-rolled string builder; the only customization
// is the program's own usage() string, which is a supported Commander configuration point.
export function buildUsageText(commands: CliCommandHandling[]): string {
    const program = new Command("pokie").helpOption(false).addHelpCommand(false).usage("<command>");
    for (const command of commands) {
        if (command.getName().startsWith("__")) {
            continue;
        }
        program.command(command.getName()).description(command.getDescription());
    }
    // Disables Commander's own terminal-width line wrapping: a description wraps across several
    // "  "-prefixed lines once it's longer than the (non-TTY-default) 80-column helpWidth, which
    // would otherwise turn one row per command into several. helpWidth is Commander's own supported
    // configuration point for this, not a replacement formatter.
    program.configureHelp({helpWidth: Number.MAX_SAFE_INTEGER});

    return program.helpInformation();
}

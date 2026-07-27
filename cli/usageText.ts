import type {CliCommandHandling} from "./CliCommandHandling.js";

// The text behind both "pokie --help"/"pokie -h" (exit 0) and the unknown-command fallback
// (exit 1) — the exit code is the caller's decision in cli/pokie.ts, the text is the same either
// way. Kept as a pure string-returning function rather than console.log-ing directly so it can be
// asserted on directly, without capturing stdout.
export function buildUsageText(commands: CliCommandHandling[]): string {
    // Widened to the longest registered name instead of a fixed column, so a long command
    // ("outcomelibrary", "certification") doesn't push its own description out of alignment with
    // every other row.
    const nameColumnWidth = commands.reduce((widest, command) => Math.max(widest, command.getName().length), 0);

    const lines = ["Usage: pokie <command>", "", "Commands:"];
    for (const command of commands) {
        lines.push(`  ${command.getName().padEnd(nameColumnWidth)}  ${command.getDescription()}`);
    }
    return lines.join("\n");
}

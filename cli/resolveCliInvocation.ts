import fs from "fs";

// What cli/pokie.ts actually dispatches on: a command name plus the args to hand that command's
// own run(). Kept intentionally tiny — this is a pure result value, not a class — so pokie.ts can
// stay a thin "resolve, then execute" shell (see resolveCliInvocation's own doc comment for why the
// resolution logic itself lives here instead of inline in pokie.ts).
export type CliInvocation = {
    commandName: string;
    args: string[];
};

const TOP_LEVEL_HELP_FLAGS = ["--help", "-h"];

// "pokie --help" / "pokie -h" asks about the CLI itself, so it has to be answered before
// resolveCliInvocation() below ever sees it: that function's step 3 routes any leading "-"-prefixed
// token to StudioCommand (which is right for "pokie --no-open", but would hand Studio a --help it
// doesn't answer and launch it instead of printing the command list). Only the *first* token counts,
// so "pokie build --help" still belongs to BuildCommand and "pokie studio --help" still belongs to
// StudioCommand — neither is a top-level help request.
export function isTopLevelHelpRequest(argv: string[]): boolean {
    const [first] = argv.slice(2);
    return first !== undefined && TOP_LEVEL_HELP_FLAGS.includes(first);
}

// Decides which registered command `argv` should run, and with which args — the one piece of logic
// standing between "pokie" (no args at all), "pokie ." / "pokie <path>" (an implicit POKIE Studio
// Project launch for that directory), an explicit "pokie studio [.|<path>]", and every existing
// "pokie <command> ..." invocation continuing to work unchanged. Returns undefined when none of
// those match — an unrecognized token that also isn't an existing path — so cli/pokie.ts's existing
// "print usage, exit 1" fallback is unaffected.
//
// Resolution order, first match wins:
//   1. No args at all               -> {commandName: "studio", args: []}                 (Home)
//   2. First token is a known command name (including "studio" itself)
//                                    -> {commandName: <that name>, args: <the rest>}       (unchanged dispatch)
//   3. First token looks like an option ("-"-prefixed, e.g. "--no-open")
//                                    -> {commandName: "studio", args: <all of argv>}       (bare Studio + flags)
//   4. First token is an existing path (`.`, a relative dir/file, or an absolute one)
//                                    -> {commandName: "studio", args: <all of argv>}       (Project mode)
//   5. Otherwise                    -> undefined                                          (unknown command)
//
// Step 4 deliberately checks the filesystem rather than guessing from shape (leading "./", a bare
// name, whatever) — an unrecognized command name must never be silently treated as a project path
// just because it looks like one; it only becomes Studio's `projectRoot` if something actually
// exists there. `pathExists` is injectable so tests never touch the real filesystem.
export function resolveCliInvocation(
    argv: string[],
    knownCommandNames: string[],
    pathExists: (candidatePath: string) => boolean = fs.existsSync,
): CliInvocation | undefined {
    const rawArgs = argv.slice(2);

    if (rawArgs.length === 0) {
        return {commandName: "studio", args: []};
    }

    const [first, ...rest] = rawArgs;

    if (knownCommandNames.includes(first)) {
        return {commandName: first, args: rest};
    }

    if (first.startsWith("-") || pathExists(first)) {
        return {commandName: "studio", args: rawArgs};
    }

    return undefined;
}

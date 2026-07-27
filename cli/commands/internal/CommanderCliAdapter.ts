import {Command, CommanderError} from "commander";

// Every silent-output config a per-command Commander instance uses: Commander's own default output
// writes error/help text straight to process.stderr/stdout, but each CliCommandHandling.run() is the
// one that owns turning a parse failure into a *thrown* Error (for dispatch.ts's own
// console.error(error.message) to print) or a success into a returned exit code — never both a
// Commander-written line AND a command-written line for the same failure.
const SILENT_COMMANDER_OUTPUT = {writeErr: () => undefined, writeOut: () => undefined};

// Builds the one per-invocation Commander instance a CliCommandHandling.run() parses its own args
// with — exitOverride() so a parse failure throws a CommanderError instead of calling
// process.exit(), helpOption(false) so Commander never intercepts this command's own "--help"/"-h"
// (see cli/dispatch.ts's isTopLevelHelpRequest for why only the CLI's own --help/-h is special-cased,
// before any of this ever runs), and silent output so Commander itself never writes anything -- the
// caller decides what reaches the user from the thrown CommanderError (see translateCommanderError).
export function createCommanderCliCommand(name: string): Command {
    return new Command(name).exitOverride().helpOption(false).configureOutput(SILENT_COMMANDER_OUTPUT);
}

// The small, per-command set of human-readable messages a translated CommanderError falls back to.
// Commander itself is what actually classifies *which* of these happened (a missing positional, an
// unrecognized flag, a flag given no value, more positionals than declared, a required option left
// out) -- this only supplies the wording each command already used before its argument declarations
// moved into Commander, so callers (and existing tests) keep seeing the same message shape.
export type CommanderErrorMessages = {
    missingArgument?: string;
    unknownOption?: (flag: string) => string;
    optionMissingArgument?: (flag: string) => string;
    excessArguments?: string;
    missingMandatoryOptionValue?: (flag: string) => string;
    // For a multi-verb command (a parent Command with only subcommands, no default action of its
    // own): an unrecognized verb word ("commander.unknownCommand") and no verb at all
    // ("commander.help" — Commander's own code for "nothing matched, so show help") both usually
    // collapse to the same combined usage message in the original hand-rolled switch's own `default`
    // case; kept distinct here only in case a command's original wording genuinely differed.
    unknownCommand?: string;
    noCommand?: string;
};

const FLAG_PATTERN = /'(--?[^'\s]+)/;

// Turns a thrown CommanderError (or, for a custom argument/option parser's own validation failure,
// the plain Error it already threw with its own exact message — see e.g. NameCommand's --count
// parser) into the Error a command's run() re-throws. A CommanderError code this command didn't
// supply a message for (or any non-Commander error) passes through with Commander's own message
// untouched, rather than being swallowed.
export function translateCommanderError(error: unknown, messages: CommanderErrorMessages): Error {
    if (!(error instanceof CommanderError)) {
        return error instanceof Error ? error : new Error(String(error));
    }

    const flag = FLAG_PATTERN.exec(error.message)?.[1];
    switch (error.code) {
        case "commander.missingArgument":
            if (messages.missingArgument !== undefined) {
                return new Error(messages.missingArgument);
            }
            break;
        case "commander.unknownOption":
            if (messages.unknownOption && flag) {
                return new Error(messages.unknownOption(flag));
            }
            break;
        case "commander.optionMissingArgument":
            if (messages.optionMissingArgument && flag) {
                return new Error(messages.optionMissingArgument(flag));
            }
            break;
        case "commander.excessArguments":
            if (messages.excessArguments !== undefined) {
                return new Error(messages.excessArguments);
            }
            break;
        case "commander.missingMandatoryOptionValue":
            if (messages.missingMandatoryOptionValue && flag) {
                return new Error(messages.missingMandatoryOptionValue(flag));
            }
            break;
        case "commander.unknownCommand":
            if (messages.unknownCommand !== undefined) {
                return new Error(messages.unknownCommand);
            }
            break;
        case "commander.help":
            if (messages.noCommand !== undefined) {
                return new Error(messages.noCommand);
            }
            break;
    }
    return new Error(error.message);
}

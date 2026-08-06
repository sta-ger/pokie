import {Command, CommanderError} from "commander";

// Every per-command Commander instance's own output configuration: an ERROR (a parse failure) is
// always silenced here (writeErr does nothing) -- each CliCommandHandling.run() is the one that owns
// turning that failure into a *thrown* Error (for dispatch.ts's own console.error(error.message) to
// print), never both a Commander-written line AND a command-written line for the same failure. HELP
// text is the opposite: Commander's own outputHelp() is the single, canonical renderer for a command's
// usage/description/arguments/options/children (see createCommanderCliCommand's own doc comment on why
// this file never re-derives or duplicates that schema), so writeOut is real here and simply prints it.
// outputHelp() always calls write() on whichever exact Command instance (parent or nested subcommand)
// matched "--help"/"-h" -- see Command.prototype.outputHelp in commander's own source -- so this alone
// is what makes a nested verb's help (e.g. "pokie certification build --help") print that verb's own
// help, never the parent's, with no bookkeeping needed on any caller's part.
const COMMANDER_OUTPUT_CONFIG = {writeErr: () => undefined, writeOut: (text: string) => console.log(text)};

// Builds the one per-invocation Commander instance a CliCommandHandling.run() parses its own args
// with — exitOverride() so a parse failure (or a completed help display) throws a CommanderError
// instead of calling process.exit(), a real "-h, --help" option so every command/verb answers its own
// --help/-h (see cli/dispatch.ts's isTopLevelHelpRequest for the separate, earlier-checked top-level
// "pokie --help"/"pokie -h"), and COMMANDER_OUTPUT_CONFIG so a parse failure never doubly prints while
// a help request prints exactly once, via Commander's own renderer. `.command(...)` subcommands
// inherit all three of these settings from their parent (see Command.prototype.copyInheritedSettings
// in commander's own source), so a multi-verb command only ever calls this once, on its own parent.
export function createCommanderCliCommand(name: string): Command {
    return new Command(name).exitOverride().helpOption("-h, --help", "Display help for this command.").configureOutput(COMMANDER_OUTPUT_CONFIG);
}

// True exactly when `error` is a CommanderError produced by a genuine "--help"/"-h" request that
// Commander already fully handled -- it already ran outputHelp() (so the help text is already on
// stdout via COMMANDER_OUTPUT_CONFIG's own writeOut above) and thrown only because exitOverride()
// turns its own internal `process.exit(0)` into a throw instead. A caller that sees this true should
// treat the invocation as a plain success (exit 0) and run no further action/side effect -- never
// re-translate it through translateCommanderError, whose fallback (a plain Error wrapping Commander's
// own generic "(outputHelp)" placeholder message) would misrepresent a successful help request as a
// failure. Deliberately narrower than "any code starting with commander.help": "commander.help" (from
// Command.prototype.help()) is also how Commander's own auto-triggered "no subcommand given"/"unknown
// subcommand" fallback reports itself -- but always with exitCode 1 (see Command.prototype._exit's own
// `{error: true}` callers), and every per-command run() below already reserves that exact combination
// for its own frozen "missing/unknown subcommand" usage+exit-1 error text via translateCommanderError's
// unknownCommand/noCommand messages -- this check must never intercept that case.
export function isCommanderHelpDisplay(error: unknown): error is CommanderError {
    return error instanceof CommanderError && error.code === "commander.helpDisplayed";
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

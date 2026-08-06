import {Command} from "commander";

export interface CliCommandHandling {
    getName(): string;

    getDescription(): string;

    run(args: string[]): Promise<void | number>;

    // Returns the exact, freshly-built Commander Command tree run() itself parses argv with -- the one
    // real registration source for this command's own name/description/arguments/options/subcommands
    // (never a second, hand-maintained description of it). Never parsed/executed by the caller: building
    // it (unlike parsing it) has no side effect, so a help-coverage test can walk it recursively --
    // including every nested subcommand -- to derive exactly which "--help"/"-h" invocations must work
    // and what each one's rendered output must contain, with no per-command exception.
    getCommanderCommand(): Command;
}

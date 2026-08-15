import {Command} from "commander";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {OutcomeLibraryCommand} from "./OutcomeLibraryCommand.js";

// Outcome generation is a runtime-capability workflow. Its established option contract is retained
// exactly by the implementation command; this public facade removes the storage-format noun from the
// normal invocation: `pokie generate <project>`.
export class GenerateCommand implements CliCommandHandling {
    private readonly outcomeLibrary: OutcomeLibraryCommand;

    constructor(pokieVersion: string) {
        this.outcomeLibrary = new OutcomeLibraryCommand(pokieVersion);
    }

    public getName(): string {
        return "generate";
    }

    public getDescription(): string {
        return "Generate weighted outcomes from a runnable POKIE project.";
    }

    public getCommanderCommand(): Command {
        return this.outcomeLibrary.getCommanderCommand().commands.find((command) => command.name() === "generate")!;
    }

    public run(args: string[]): Promise<number> {
        return this.outcomeLibrary.run(["generate", ...args]);
    }
}

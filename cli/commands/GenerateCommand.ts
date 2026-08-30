import {Command} from "commander";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {OutcomeLibraryCommand} from "./OutcomeLibraryCommand.js";

// Outcome generation is a runtime-capability workflow. Its established option contract is retained
// exactly by the implementation command; this public facade removes the storage-format noun from the
// normal invocation: `pokie generate <project>`.
export class GenerateCommand implements CliCommandHandling {
    private readonly outcomeLibrary: OutcomeLibraryCommand;

    constructor(pokieVersion: string, outcomeLibrary: OutcomeLibraryCommand = new OutcomeLibraryCommand(pokieVersion)) {
        this.outcomeLibrary = outcomeLibrary;
    }

    public getName(): string {
        return "generate";
    }

    public getDescription(): string {
        return "Generate weighted outcomes from a runnable POKIE project.";
    }

    public getCommanderCommand(): Command {
        const command = this.outcomeLibrary.getGenerateCommanderCommand();
        // The shared grammar child is freshly constructed for this call. Detach it from its private
        // namespace parent before exposing it as the public command's help tree, otherwise
        // Commander renders "outcomelibrary generate" in the Usage line.
        command.parent = null;
        command.name("generate");
        return command;
    }

    public async run(args: string[]): Promise<number> {
        if (args.includes("--help") || args.includes("-h")) {
            console.log(this.getCommanderCommand().helpInformation());
            return 0;
        }
        try {
            return await this.outcomeLibrary.runGenerate(args);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // OutcomeLibraryCommand supplies the shared implementation grammar. Its historical
            // namespace is never part of the public error
            // contract: a user who ran `pokie generate` must get a retryable `pokie generate` hint.
            throw new Error(message.replace(/pokie outcomelibrary generate/g, "pokie generate"));
        }
    }
}

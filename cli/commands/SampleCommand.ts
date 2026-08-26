import {Command} from "commander";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {OutcomeSourceCommand} from "./OutcomeSourceCommand.js";

// A single outcome draw is a capability, not a source-format namespace. The delegated command is
// intentionally private to this facade, preserving its proven selector and seeded-draw behavior.
export class SampleCommand implements CliCommandHandling {
    private readonly outcomeSource: OutcomeSourceCommand = new OutcomeSourceCommand();

    public getName(): string {
        return "sample";
    }

    public getDescription(): string {
        return "Draw one outcome from a project that supports outcome sampling.";
    }

    public getCommanderCommand(): Command {
        const command = this.outcomeSource.getCommanderCommand().commands.find((candidate) => candidate.name() === "sample")!;
        command.parent = null;
        command.name("sample");
        return command;
    }

    public async run(args: string[]): Promise<number> {
        try {
            return await this.outcomeSource.run(["sample", ...args]);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(message.replace(/pokie outcomesource sample/g, "pokie sample"));
        }
    }
}

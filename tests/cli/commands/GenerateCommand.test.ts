import {GenerateCommand} from "../../../cli/commands/GenerateCommand.js";

describe("GenerateCommand", () => {
    it("renders public help without its private implementation namespace", async () => {
        const command = new GenerateCommand("1.3.0");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        expect(command.getName()).toBe("generate");
        expect(command.getCommanderCommand().name()).toBe("generate");
        expect(await command.run(["--help"])).toBe(0);

        const help = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
        expect(help).toContain("Usage: generate");
        expect(help).not.toMatch(/\b(?:outcomelibrary|outcomesource|stakeengine)\b/);

        logSpy.mockRestore();
    });

    it("translates delegated invalid input to the public command", async () => {
        const command = new GenerateCommand("1.3.0");
        const error = await command.run([]).then(
            () => new Error("Expected generate to reject missing input."),
            (reason: unknown) => reason,
        );

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Usage: pokie generate <packageRoot>");
        expect((error as Error).message).not.toMatch(/\bpokie (?:outcomelibrary|outcomesource|stakeengine)\b/);
    });
});

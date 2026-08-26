import {SampleCommand} from "../../../cli/commands/SampleCommand.js";

describe("SampleCommand", () => {
    it("renders public help without its private implementation namespace", async () => {
        const command = new SampleCommand();
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        expect(command.getName()).toBe("sample");
        expect(command.getCommanderCommand().name()).toBe("sample");
        expect(await command.run(["--help"])).toBe(0);

        const help = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
        expect(help).toContain("Usage: sample");
        expect(help).not.toMatch(/\b(?:outcomelibrary|outcomesource|stakeengine)\b/);

        logSpy.mockRestore();
    });

    it("translates delegated invalid input to the public command", async () => {
        const command = new SampleCommand();
        const error = await command.run([]).then(
            () => new Error("Expected sample to reject missing input."),
            (reason: unknown) => reason,
        );

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Usage: pokie sample <path>");
        expect((error as Error).message).not.toMatch(/\bpokie (?:outcomelibrary|outcomesource|stakeengine)\b/);
    });
});

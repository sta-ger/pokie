import {ImportCommand} from "../../../cli/commands/ImportCommand.js";

describe("ImportCommand", () => {
    it("exposes one generic import command and handles help without dispatching an import", async () => {
        const command = new ImportCommand("1.3.0");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await expect(command.run(["--help"])).resolves.toBe(0);
        expect(command.getName()).toBe("import");
        expect(command.getCommanderCommand().name()).toBe("import");

        logSpy.mockRestore();
    });
});

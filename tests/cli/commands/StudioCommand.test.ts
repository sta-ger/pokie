import path from "path";
import {StudioCommand} from "../../../cli/commands/StudioCommand.js";
import type {StudioServerHandling} from "../../../cli/studio/StudioServerHandling.js";

describe("StudioCommand startup diagnostics", () => {
    it("turns a busy Studio port into an actionable --port diagnostic", async () => {
        const addressInUse = Object.assign(new Error("listen EADDRINUSE: address already in use 127.0.0.1:3200"), {
            code: "EADDRINUSE",
            address: "127.0.0.1",
            port: 3200,
        });
        const server: StudioServerHandling = {
            start: jest.fn().mockRejectedValue(addressInUse),
            stop: jest.fn().mockResolvedValue(undefined),
        };
        const command = new StudioCommand("2.0.0", process.cwd(), {
            createServer: () => server,
            openBrowser: () => undefined,
            studioRoot: path.join(process.cwd(), "cli/studio-client"),
        });

        await expect(command.run(["--no-open", "--port", "3200"])).rejects.toThrow(
            "POKIE Studio could not listen on 127.0.0.1:3200 because that address is already in use. " +
                "Stop the process using it, or retry with --port <number> (or --port 0 for an available port).",
        );
        expect(server.stop).not.toHaveBeenCalled();
    });
});

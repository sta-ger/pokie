import path from "path";
import {InspectCommand} from "../../cli/commands/InspectCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {StudioRuntimeManager} from "../../cli/studio/runtime/StudioRuntimeManager.js";

const fixtureRoot = path.join(__dirname, "fixtures", "playable-game");

// End-to-end happy path for the Runtime tab's whole feature set, driven directly against
// StudioRuntimeManager (the exact class StudioServer's /api/project/runtime* routes delegate to — see
// tests/cli/studio/StudioServer.test.ts for the HTTP-level version of this same workflow). Nothing here
// is faked: a real PokieDevServer is started on an OS-assigned port against a real, already-built
// fixture game package, and — mirroring BlueprintEditorWorkflow.integration.test.ts's own "prove the
// rest of the CLI still works afterward" reasoning — the same package is then run through the real
// InspectCommand/ValidateCommand/SimCommand/ReplayCommand pipeline to confirm using the Runtime tab
// never leaves the project in a broken state for any other Studio tab/CLI command.
describe("Runtime tab workflow (integration): start -> create session -> spin -> idempotent replay -> conflict -> stop", () => {
    let manager: StudioRuntimeManager;

    beforeEach(() => {
        manager = new StudioRuntimeManager();
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(async () => {
        await manager.stop();
        (console.log as jest.Mock).mockRestore();
    });

    it("runs the full session lifecycle against a real running runtime server", async () => {
        const started = await manager.start(fixtureRoot, {debug: true, repositoryMode: "memory", port: 0});
        expect(started.status).toBe("started");
        if (started.status !== "started" || started.view.status !== "running") {
            return;
        }
        expect(started.view.port).toBeGreaterThan(0);
        expect(manager.getState()).toEqual(started.view);

        const created = await manager.createSession();
        expect(created.status).toBe("ok");
        if (created.status !== "ok") {
            return;
        }
        const sessionId = created.session.sessionId;
        expect(typeof created.session.sessionVersion).toBe("number");
        expect(created.session.debug).toBeDefined();

        const fetched = await manager.getSession(sessionId);
        expect(fetched.status).toBe("ok");
        if (fetched.status === "ok") {
            expect(fetched.session.sessionId).toBe(sessionId);
        }

        const firstSpin = await manager.spin(sessionId, "req-1");
        expect(firstSpin.status).toBe("ok");

        // Repeating the same requestId returns the byte-identical result rather than spinning again —
        // proving the idempotency guarantee is genuinely preserved end-to-end through the manager.
        const replaySpin = await manager.spin(sessionId, "req-1");
        expect(replaySpin).toEqual(firstSpin);

        // A stale, client-declared expectedSessionVersion is rejected as a conflict without spinning.
        const staleSpin = await manager.spin(sessionId, undefined, 999);
        expect(staleSpin.status).toBe("conflict");
        if (staleSpin.status === "conflict") {
            expect(staleSpin.error).toContain("999");
        }

        const unknown = await manager.getSession("does-not-exist");
        expect(unknown).toEqual({status: "not-found"});

        const stopped = await manager.stop();
        expect(stopped).toEqual({status: "stopped"});
        expect(manager.getState()).toEqual({status: "stopped"});
    });

    it("leaves the project fully usable by every other Studio/CLI tool afterward", async () => {
        await manager.start(fixtureRoot, {debug: false, repositoryMode: "memory", port: 0});
        const created = await manager.createSession();
        if (created.status === "ok") {
            await manager.spin(created.session.sessionId, "req-1");
        }
        await manager.stop();

        const inspectExitCode = await new InspectCommand().run([fixtureRoot]);
        expect(inspectExitCode).toBe(0);

        const validateExitCode = await new ValidateCommand().run([fixtureRoot]);
        expect(validateExitCode).toBe(0);

        await expect(new SimCommand().run([fixtureRoot, "--rounds", "50", "--seed", "demo"])).resolves.toBeUndefined();
        await expect(new ReplayCommand().run([fixtureRoot, "--round", "3", "--seed", "demo"])).resolves.toBeUndefined();
    });

    it("keeps sessions isolated per manager instance: a fresh manager for the same project starts with no sessions", async () => {
        await manager.start(fixtureRoot, {debug: false, repositoryMode: "memory", port: 0});
        const created = await manager.createSession();
        const sessionId = created.status === "ok" ? created.session.sessionId : "unused";
        await manager.stop();

        const otherManager = new StudioRuntimeManager();
        await otherManager.start(fixtureRoot, {debug: false, repositoryMode: "memory", port: 0});
        const result = await otherManager.getSession(sessionId);

        expect(result).toEqual({status: "not-found"});

        await otherManager.stop();
    });
});

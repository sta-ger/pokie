import fs from "node:fs";
import path from "node:path";
import {runInNewContext} from "node:vm";
import * as api from "@fromstan/pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {CreateCommand} from "../../cli/commands/CreateCommand.js";
import {InitCommand} from "../../cli/commands/InitCommand.js";
import {InspectCommand} from "../../cli/commands/InspectCommand.js";
import {INTERNAL_STUDIO_COMMAND_NAME} from "../../cli/commands/InternalStudioCommand.js";
import {dispatch} from "../../cli/dispatch.js";
import {registerCliCommands} from "../../cli/registerCliCommands.js";
import {resolveCliInvocation} from "../../cli/resolveCliInvocation.js";

// Source-aware public-command prerequisites. These are neither installed-consumer
// checks nor an independent first-contact observation or material-finding closure.
describe("V2C-33 Programmer / CLI prerequisites", () => {
    let directory: string;
    let log: jest.SpyInstance;
    let error: jest.SpyInstance;
    const commands = [new CreateCommand(api.POKIE_VERSION), new InitCommand(api.POKIE_VERSION),
        new BuildCommand(api.POKIE_VERSION), new InspectCommand()];
    const run = (...args: string[]) => dispatch(commands, ["node", "pokie", ...args], api.POKIE_VERSION);
    const output = () => log.mock.calls.flat().join("\n");
    const diagnostic = () => error.mock.calls.flat().join("\n");

    beforeEach(() => {
        directory = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/valera33-"));
        log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("discovers real public help and recovers from a typo without starting Studio", async () => {
        const registered = registerCliCommands({version: api.POKIE_VERSION, pokiePackageRoot: process.cwd(),
            clientRoot: path.join(directory, "client"), studioRoot: path.join(directory, "studio")});
        const studio = registered.find(command => command.getName() === INTERNAL_STUDIO_COMMAND_NAME)!;
        const launch = jest.spyOn(studio, "run").mockResolvedValue(0);
        const invoke = (...args: string[]) => dispatch(registered, ["node", "pokie", ...args], api.POKIE_VERSION);
        expect(await invoke("--version")).toBe(0);
        expect(output()).toBe("2.0.0");
        log.mockClear();
        expect(await invoke("--help")).toBe(0);
        expect(output()).toContain("Open Studio Home:");
        expect(output()).toContain("pokie init <directory>");
        expect(output()).not.toMatch(/^\s+export\b/m);
        expect(await invoke("buidl")).toBe(1);
        expect(diagnostic()).toContain("Did you mean `build`?");
        log.mockClear();
        expect(await invoke("build", "--help")).toBe(0);
        expect(output()).toContain("--target <artifact>");
        expect(launch).not.toHaveBeenCalled();
        expect(fs.readdirSync(directory)).toEqual([]);
    });

    it("keeps bare Home distinct from an explicitly selected spaced Blueprint path", async () => {
        const source = path.join(directory, "editable game.blueprint.json");
        expect(await run("create", "CLI Game", "--blank", "--out", source)).toBe(0);
        const authored = api.loadGameBlueprint(source);
        expect(authored.manifest).toMatchObject({id: "cli-game", name: "CLI Game"});
        expect(new api.GameBlueprintValidator().validate(authored).filter(issue => issue.severity === "error")).toEqual([]);
        const names = commands.map(command => command.getName());
        expect(resolveCliInvocation(["node", "pokie"], names)).toEqual({commandName: INTERNAL_STUDIO_COMMAND_NAME, args: []});
        expect(resolveCliInvocation(["node", "pokie", source], names)).toEqual({commandName: INTERNAL_STUDIO_COMMAND_NAME, args: [source]});
        expect(await run("inspect", source)).toBe(0);
        expect(output()).toContain(source);
        expect(await new api.ProjectTargetResolver().resolve(source)).toMatchObject({type: "blueprint", rootPath: source});
        const before = fs.readFileSync(source);
        expect(await run("create", "Replacement", "--blank", "--out", source)).toBe(1);
        expect(diagnostic()).toContain("already exists");
        expect(fs.readFileSync(source)).toEqual(before);
        expect(fs.readdirSync(directory)).toEqual([path.basename(source)]);
    });

    it("previews and publishes a generated package into an empty spaced destination while preserving source and occupied output", async () => {
        const source = path.join(directory, "source game.json");
        const destination = path.join(directory, "generated game");
        expect(await run("create", "CLI Game", "--blank", "--out", source)).toBe(0);
        const before = fs.readFileSync(source);
        const args = ["build", source, "--target", "tsPackage", "--out", destination];
        expect(await run(...args, "--dry-run")).toBe(0);
        expect(fs.existsSync(destination)).toBe(false);
        fs.mkdirSync(destination);
        expect(await run(...args)).toBe(0);
        const manifest = JSON.parse(fs.readFileSync(path.join(destination, "package.json"), "utf8"));
        expect(manifest).toMatchObject({main: "./dist/index.js", pokie: {entry: "./dist/index.js"},
            dependencies: {"@fromstan/pokie": "^2.0.0"}});
        const runtimePath = path.join(destination, "dist/index.js");
        const runtimeBytes = fs.readFileSync(runtimePath, "utf8");
        const module: {exports: unknown} = {exports: {}};
        // Evaluate emitted game logic against source exports, without claiming native installation.
        runInNewContext(runtimeBytes, {module, require: (specifier: string) => {
            expect(specifier).toBe("@fromstan/pokie");
            return api;
        }});
        const game = module.exports as api.PokieGame;
        expect(game.getManifest()).toEqual(api.loadGameBlueprint(source).manifest);
        const session = game.createSession({seed: "programmer33"}) as api.VideoSlotSession;
        session.setBet(1);
        session.play();
        expect(Number.isFinite(session.getWinAmount())).toBe(true);
        expect(await new api.ProjectTargetResolver().resolve(destination)).toMatchObject({type: "tsPackage"});
        const files = fs.readdirSync(destination).sort();
        log.mockClear();
        expect(await run(...args)).toBe(1);
        expect(output()).not.toContain("Build summary:");
        expect(fs.readFileSync(runtimePath, "utf8")).toBe(runtimeBytes);
        expect(fs.readdirSync(destination).sort()).toEqual(files);
        expect(await run("build", source, "--target", "tsPackage", "--out", directory)).toBe(1);
        expect(fs.readFileSync(source)).toEqual(before);
    });

    it("rejects wrong input without partial publication and retries a corrected Blueprint", async () => {
        const source = path.join(directory, "repair game.json");
        const destination = path.join(directory, "recovered package");
        const listeners = process.rawListeners("SIGINT");
        expect(await run("build", source, "--out", destination)).toBe(1);
        expect(diagnostic()).toContain("--target is required");
        expect(await run("build", source, "--target", "unknown", "--out", destination)).toBe(1);
        expect(diagnostic()).toContain('Unknown --target "unknown"');
        expect(await run("inspect", source)).toBe(1);
        expect(diagnostic()).toContain("not a supported POKIE project");
        expect(await run("create", "Retry", "--blank", "--out", source)).toBe(0);
        const validBytes = fs.readFileSync(source);
        const invalid = JSON.parse(validBytes.toString());
        invalid.rows = 0;
        fs.writeFileSync(source, JSON.stringify(invalid));
        const args = ["build", source, "--target", "tsPackage", "--out", destination];
        log.mockClear();
        expect(await run(...args)).toBe(1);
        expect(output()).not.toContain("Build summary:");
        expect(fs.existsSync(destination)).toBe(false);
        expect(JSON.parse(fs.readFileSync(source, "utf8")).rows).toBe(0);
        fs.writeFileSync(source, validBytes);
        expect(await run(...args)).toBe(0);
        expect(fs.existsSync(path.join(destination, "dist/index.js"))).toBe(true);
        expect(fs.readFileSync(source)).toEqual(validBytes);
        expect(process.rawListeners("SIGINT")).toEqual(listeners);
    });

    it("cancels the real build before publication, drains its listener and permits retry", async () => {
        const source = path.join(directory, "cancel game.json");
        const destination = path.join(directory, "cancelled package");
        expect(await run("create", "Cancel", "--blank", "--out", source)).toBe(0);
        const before = fs.readFileSync(source);
        const listeners = process.rawListeners("SIGINT");
        let cancelled = false;
        log.mockImplementation(message => {
            if (message === "Build running: Publishing TypeScript package") {
                cancelled = true;
                process.emit("SIGINT");
            }
        });
        const args = ["build", source, "--target", "tsPackage", "--out", destination];
        expect(await run(...args)).toBe(1);
        expect(cancelled).toBe(true);
        expect(output()).toContain("Artifact build cancelled.");
        expect(output()).not.toContain("Build summary:");
        expect(fs.existsSync(destination)).toBe(false);
        expect(fs.readFileSync(source)).toEqual(before);
        expect(process.rawListeners("SIGINT")).toEqual(listeners);
        log.mockImplementation(() => undefined);
        expect(await run(...args)).toBe(0);
        expect(process.rawListeners("SIGINT")).toEqual(listeners);
    });

    it("initializes code-first files only after consent and preserves custom TypeScript on retry", async () => {
        const project = path.join(directory, "custom game");
        fs.mkdirSync(project);
        fs.writeFileSync(path.join(project, "notes.txt"), "user-owned notes");
        expect(await run("init", project, "--no-prepare")).toBe(1);
        expect(diagnostic()).toContain("--yes");
        expect(fs.readdirSync(project)).toEqual(["notes.txt"]);
        expect(await run("init", project, "--yes", "--no-prepare")).toBe(0);
        const entryPath = path.join(project, "src/index.ts");
        const authored = fs.readFileSync(entryPath, "utf8") + "\n// My custom TypeScript extension stays mine.\n";
        fs.writeFileSync(entryPath, authored);
        const manifest = fs.readFileSync(path.join(project, "package.json"));
        expect(JSON.parse(manifest.toString())).toMatchObject({pokie: {entry: "./dist/index.js"},
            dependencies: {"@fromstan/pokie": "^2.0.0"}});
        log.mockClear();
        expect(await run("init", project, "--no-prepare")).toBe(0);
        expect(output()).toContain("scaffolded");
        expect(output()).not.toContain("prepared and verified");
        expect(fs.readFileSync(entryPath, "utf8")).toBe(authored);
        expect(fs.readFileSync(path.join(project, "package.json"))).toEqual(manifest);
        expect(fs.readFileSync(path.join(project, "notes.txt"), "utf8")).toBe("user-owned notes");
        expect(fs.existsSync(path.join(project, "dist"))).toBe(false);
        expect(fs.existsSync(path.join(project, "node_modules"))).toBe(false);
        expect(await new api.ProjectTargetResolver().resolve(project)).toMatchObject({type: "tsPackage"});
    });
});

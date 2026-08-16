import {PlatformDirectoryEnvironment} from "../../../../cli/paths/PlatformDirectoryEnvironment.js";
import {RunNativeCommand, StudioNativePickerService} from "../../../../cli/studio/home/StudioNativePickerService.js";

function envFor(platform: NodeJS.Platform, env: NodeJS.ProcessEnv = {}): PlatformDirectoryEnvironment {
    return {platform, env, homeDir: "/home/alice"};
}

function okRun(stdout: string): RunNativeCommand {
    return jest.fn().mockResolvedValue({stdout, stderr: ""});
}

function failingRun(error: unknown): RunNativeCommand {
    return jest.fn().mockRejectedValue(error);
}

describe("StudioNativePickerService", () => {
    describe("checkAvailability", () => {
        it("is available on darwin regardless of display env vars", () => {
            const service = new StudioNativePickerService(envFor("darwin"), okRun(""));
            expect(service.checkAvailability()).toEqual({status: "available"});
        });

        it("is available on win32 regardless of display env vars", () => {
            const service = new StudioNativePickerService(envFor("win32"), okRun(""));
            expect(service.checkAvailability()).toEqual({status: "available"});
        });

        it("is available on linux when DISPLAY is set", () => {
            const service = new StudioNativePickerService(envFor("linux", {DISPLAY: ":0"}), okRun(""));
            expect(service.checkAvailability()).toEqual({status: "available"});
        });

        it("is available on linux when only WAYLAND_DISPLAY is set", () => {
            const service = new StudioNativePickerService(envFor("linux", {WAYLAND_DISPLAY: "wayland-0"}), okRun(""));
            expect(service.checkAvailability()).toEqual({status: "available"});
        });

        it("is unavailable on a headless linux host (no display env vars)", () => {
            const service = new StudioNativePickerService(envFor("linux", {}), okRun(""));
            const result = service.checkAvailability();
            expect(result.status).toBe("unavailable");
            expect((result as {reason: string}).reason).toContain("No graphical display");
        });
    });

    describe("pick on linux", () => {
        it("returns unavailable without ever invoking a command when there is no display", async () => {
            const run = jest.fn();
            const service = new StudioNativePickerService(envFor("linux", {}), run);

            const result = await service.pick({kind: "directory"});

            expect(result.status).toBe("unavailable");
            expect(run).not.toHaveBeenCalled();
        });

        it("returns the selected path from zenity, passing the start path and directory flag as separate argv entries", async () => {
            const run = okRun("/home/alice/games/sample-slot\n");
            const service = new StudioNativePickerService(envFor("linux", {DISPLAY: ":0"}), run);

            const result = await service.pick({kind: "directory", startPath: "/home/alice/games"});

            expect(result).toEqual({status: "selected", path: "/home/alice/games/sample-slot"});
            expect(run).toHaveBeenCalledWith("zenity", ["--file-selection", "--directory", "--filename=/home/alice/games/"]);
        });

        it("reports a plain Cancel click (empty stdout) as cancelled, not an error", async () => {
            const run = okRun("");
            const service = new StudioNativePickerService(envFor("linux", {DISPLAY: ":0"}), run);

            const result = await service.pick({kind: "directory"});

            expect(result).toEqual({status: "cancelled"});
        });

        it("falls back to kdialog when zenity is not installed", async () => {
            const run = jest
                .fn()
                .mockRejectedValueOnce(Object.assign(new Error("not found"), {code: "ENOENT"}))
                .mockResolvedValueOnce({stdout: "/home/alice/games\n", stderr: ""});
            const service = new StudioNativePickerService(envFor("linux", {DISPLAY: ":0"}), run);

            const result = await service.pick({kind: "directory"});

            expect(result).toEqual({status: "selected", path: "/home/alice/games"});
            expect(run).toHaveBeenNthCalledWith(2, "kdialog", ["--getexistingdirectory", "."]);
        });

        it("reports unavailable when neither zenity nor kdialog is installed", async () => {
            const run = jest.fn().mockRejectedValue(Object.assign(new Error("not found"), {code: "ENOENT"}));
            const service = new StudioNativePickerService(envFor("linux", {DISPLAY: ":0"}), run);

            const result = await service.pick({kind: "file"});

            expect(result.status).toBe("unavailable");
        });

        it("passes file filters through as their own argv entries, never shell-joined", async () => {
            const run = okRun("/home/alice/blueprint.json\n");
            const service = new StudioNativePickerService(envFor("linux", {DISPLAY: ":0"}), run);

            await service.pick({kind: "file", fileFilters: [{name: "JSON files", extensions: ["json"]}]});

            expect(run).toHaveBeenCalledWith("zenity", ["--file-selection", "--file-filter=JSON files | *.json"]);
        });

        it("opens zenity's native Save dialog for a file destination", async () => {
            const run = okRun("/home/alice/exports/game.par.xlsx\n");
            const service = new StudioNativePickerService(envFor("linux", {WAYLAND_DISPLAY: "wayland-0"}), run);

            await service.pick({kind: "file", mode: "save", startPath: "/home/alice/exports/game.par.xlsx", fileFilters: [{name: "PAR sheets", extensions: ["xlsx"]}]});

            expect(run).toHaveBeenCalledWith("zenity", [
                "--file-selection",
                "--save",
                "--confirm-overwrite",
                "--filename=/home/alice/exports/game.par.xlsx",
                "--file-filter=PAR sheets | *.xlsx",
            ]);
        });
    });

    describe("pick on darwin", () => {
        it("returns the selected path from osascript and safely escapes a start path containing quotes", async () => {
            const run = okRun("/Users/alice/My \"Games\"\n");
            const service = new StudioNativePickerService(envFor("darwin"), run);

            const result = await service.pick({kind: "directory", startPath: 'C:\\odd "path"'});

            expect(result).toEqual({status: "selected", path: '/Users/alice/My "Games"'});
            const [, args] = (run as jest.Mock).mock.calls[0];
            expect(args[0]).toBe("-e");
            expect(args[1]).toContain('default location (POSIX file "C:\\\\odd \\"path\\"")');
        });

        it("reports AppleScript's -128 user-cancel error as cancelled", async () => {
            const run = failingRun(Object.assign(new Error("fail"), {stderr: "execution error: User canceled. (-128)"}));
            const service = new StudioNativePickerService(envFor("darwin"), run);

            const result = await service.pick({kind: "directory"});

            expect(result).toEqual({status: "cancelled"});
        });

        it("uses choose file name for a native Save dialog", async () => {
            const run = okRun("/Users/alice/game.json\n");
            const service = new StudioNativePickerService(envFor("darwin"), run);

            await service.pick({kind: "file", mode: "save"});

            expect((run as jest.Mock).mock.calls[0][1][1]).toContain("choose file name");
        });
    });

    describe("pick on win32", () => {
        it("returns the selected path from a POKIE_SELECTED: marker line", async () => {
            const run = okRun("POKIE_SELECTED:C:\\Users\\alice\\games\n");
            const service = new StudioNativePickerService(envFor("win32"), run);

            const result = await service.pick({kind: "directory", startPath: "C:\\Users\\alice"});

            expect(result).toEqual({status: "selected", path: "C:\\Users\\alice\\games"});
            const [command, args] = (run as jest.Mock).mock.calls[0];
            expect(command).toBe("powershell.exe");
            expect(args.join(" ")).toContain("FolderBrowserDialog");
        });

        it("reports a POKIE_CANCELLED marker line as cancelled", async () => {
            const run = okRun("POKIE_CANCELLED\n");
            const service = new StudioNativePickerService(envFor("win32"), run);

            const result = await service.pick({kind: "file"});

            expect(result).toEqual({status: "cancelled"});
        });

        it("doubles an embedded single quote in the start path so it can't break out of the PowerShell string literal", async () => {
            const run = okRun("POKIE_CANCELLED\n");
            const service = new StudioNativePickerService(envFor("win32"), run);

            await service.pick({kind: "directory", startPath: "C:\\it's mine"});

            const [, args] = (run as jest.Mock).mock.calls[0];
            const script = args[args.length - 1] as string;
            expect(script).toContain("$dialog.SelectedPath = 'C:\\it''s mine'");
        });

        it("uses SaveFileDialog for a file destination", async () => {
            const run = okRun("POKIE_CANCELLED\n");
            const service = new StudioNativePickerService(envFor("win32"), run);

            await service.pick({kind: "file", mode: "save", fileFilters: [{name: "JSON files", extensions: ["json"]}]});

            const [, args] = (run as jest.Mock).mock.calls[0];
            expect((args[args.length - 1] as string)).toContain("SaveFileDialog");
        });
    });
});

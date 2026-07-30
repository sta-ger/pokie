import {openInFileManager} from "../../cli/openInFileManager.js";

describe("openInFileManager", () => {
    it('uses "open" on darwin', () => {
        const calls: [string, string[]][] = [];
        openInFileManager("/a/folder", "darwin", ((command: string, args: string[]) => {
            calls.push([command, args]);
        }) as never);

        expect(calls).toEqual([["open", ["/a/folder"]]]);
    });

    it('uses "explorer" on win32', () => {
        const calls: [string, string[]][] = [];
        openInFileManager("C:\\a\\folder", "win32", ((command: string, args: string[]) => {
            calls.push([command, args]);
        }) as never);

        expect(calls).toEqual([["explorer", ["C:\\a\\folder"]]]);
    });

    it('uses "xdg-open" on other platforms', () => {
        const calls: [string, string[]][] = [];
        openInFileManager("/a/folder", "linux", ((command: string, args: string[]) => {
            calls.push([command, args]);
        }) as never);

        expect(calls).toEqual([["xdg-open", ["/a/folder"]]]);
    });

    it("passes the folder path as its own argv entry rather than interpolating it into a shell string", () => {
        const calls: [string, string[]][] = [];
        openInFileManager("/a/folder $(rm -rf /) `whoami`", "linux", ((command: string, args: string[]) => {
            calls.push([command, args]);
        }) as never);

        expect(calls).toEqual([["xdg-open", ["/a/folder $(rm -rf /) `whoami`"]]]);
    });

    it("never throws even if the exec implementation itself throws", () => {
        expect(() =>
            openInFileManager(
                "/a/folder",
                "linux",
                (() => {
                    throw new Error("no display");
                }) as never,
            ),
        ).not.toThrow();
    });
});

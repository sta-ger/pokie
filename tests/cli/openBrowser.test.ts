import {openBrowser} from "../../cli/openBrowser.js";

describe("openBrowser", () => {
    it("uses \"open\" on darwin", () => {
        const calls: string[] = [];
        openBrowser("http://localhost:3100", "darwin", ((command: string) => {
            calls.push(command);
        }) as never);

        expect(calls).toEqual(['open "http://localhost:3100"']);
    });

    it("uses \"start\" on win32", () => {
        const calls: string[] = [];
        openBrowser("http://localhost:3100", "win32", ((command: string) => {
            calls.push(command);
        }) as never);

        expect(calls).toEqual(['start "" "http://localhost:3100"']);
    });

    it("uses \"xdg-open\" on other platforms", () => {
        const calls: string[] = [];
        openBrowser("http://localhost:3100", "linux", ((command: string) => {
            calls.push(command);
        }) as never);

        expect(calls).toEqual(['xdg-open "http://localhost:3100"']);
    });

    it("never throws even if the exec implementation itself throws", () => {
        expect(() =>
            openBrowser(
                "http://localhost:3100",
                "linux",
                (() => {
                    throw new Error("no display");
                }) as never,
            ),
        ).not.toThrow();
    });
});

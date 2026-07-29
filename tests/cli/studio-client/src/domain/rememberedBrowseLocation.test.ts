import {getRememberedBrowseLocation, setRememberedBrowseLocation} from "../../../../../cli/studio-client/src/domain/rememberedBrowseLocation";

// This suite runs under the plain-Node "pokie" project (no jsdom, no real localStorage global) — a
// minimal in-memory fake stands in for it, the same seam the real implementation already goes through
// try/catch for (see rememberedBrowseLocation.ts's own doc comment on a storage-disabled browser).
function installFakeLocalStorage(): Storage {
    const store = new Map<string, string>();
    const fake = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        key: () => null,
        get length() {
            return store.size;
        },
    } as Storage;
    (global as unknown as {localStorage: Storage}).localStorage = fake;
    return fake;
}

describe("rememberedBrowseLocation", () => {
    afterEach(() => {
        Reflect.deleteProperty(global as unknown as {localStorage?: Storage}, "localStorage");
    });

    it("returns undefined for a browseId nothing has been remembered for yet", () => {
        installFakeLocalStorage();

        expect(getRememberedBrowseLocation("create-project-destination")).toBeUndefined();
    });

    it("round-trips a remembered location scoped to its own browseId", () => {
        installFakeLocalStorage();

        setRememberedBrowseLocation("create-project-destination", "/home/alice/games");
        setRememberedBrowseLocation("blueprint-file", "/home/alice/blueprints");

        expect(getRememberedBrowseLocation("create-project-destination")).toBe("/home/alice/games");
        expect(getRememberedBrowseLocation("blueprint-file")).toBe("/home/alice/blueprints");
    });

    it("never throws when localStorage is unavailable (no global defined)", () => {
        expect(() => setRememberedBrowseLocation("create-project-destination", "/home/alice/games")).not.toThrow();
        expect(getRememberedBrowseLocation("create-project-destination")).toBeUndefined();
    });
});

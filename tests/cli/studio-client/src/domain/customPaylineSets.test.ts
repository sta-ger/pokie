import {
    deleteCustomPaylineSet,
    listCustomPaylineSets,
    renameCustomPaylineSet,
    saveCustomPaylineSet,
} from "../../../../../cli/studio-client/src/domain/customPaylineSets";

// Same seam as rememberedBrowseLocation.test.ts -- this suite runs under the plain-Node "pokie" project
// (no jsdom, no real localStorage global), so a minimal in-memory fake stands in for it.
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

describe("customPaylineSets", () => {
    afterEach(() => {
        Reflect.deleteProperty(global as unknown as {localStorage?: Storage}, "localStorage");
    });

    it("returns an empty list when nothing has been saved yet", () => {
        installFakeLocalStorage();

        expect(listCustomPaylineSets()).toEqual([]);
    });

    it("saves a custom set with a fresh id and lists it back", () => {
        installFakeLocalStorage();

        const saved = saveCustomPaylineSet("My 5 lines", 5, 3, [
            [1, 1, 1, 1, 1],
            [0, 0, 0, 0, 0],
        ]);

        expect(saved.id).toEqual(expect.any(String));
        expect(listCustomPaylineSets()).toEqual([{id: saved.id, name: "My 5 lines", reels: 5, rows: 3, lines: saved.lines}]);
    });

    it("keeps each saved set's lines independent from the array passed in (defensive copy)", () => {
        installFakeLocalStorage();
        const lines = [[1, 1, 1]];

        const saved = saveCustomPaylineSet("Center", 3, 3, lines);
        lines[0][0] = 99;

        expect(saved.lines).toEqual([[1, 1, 1]]);
        expect(listCustomPaylineSets()[0].lines).toEqual([[1, 1, 1]]);
    });

    it("appends rather than overwrites when saving a second set", () => {
        installFakeLocalStorage();

        saveCustomPaylineSet("First", 3, 3, [[1, 1, 1]]);
        saveCustomPaylineSet("Second", 3, 3, [[0, 0, 0]]);

        expect(listCustomPaylineSets().map((set) => set.name)).toEqual(["First", "Second"]);
    });

    it("renames a set in place by id, leaving others untouched", () => {
        installFakeLocalStorage();
        const first = saveCustomPaylineSet("First", 3, 3, [[1, 1, 1]]);
        saveCustomPaylineSet("Second", 3, 3, [[0, 0, 0]]);

        renameCustomPaylineSet(first.id, "Renamed");

        const names = listCustomPaylineSets().map((set) => set.name);
        expect(names).toEqual(["Renamed", "Second"]);
    });

    it("deletes a set by id, leaving others untouched", () => {
        installFakeLocalStorage();
        const first = saveCustomPaylineSet("First", 3, 3, [[1, 1, 1]]);
        saveCustomPaylineSet("Second", 3, 3, [[0, 0, 0]]);

        deleteCustomPaylineSet(first.id);

        expect(listCustomPaylineSets().map((set) => set.name)).toEqual(["Second"]);
    });

    it("never throws when localStorage is unavailable, and lists as empty", () => {
        expect(() => saveCustomPaylineSet("First", 3, 3, [[1, 1, 1]])).not.toThrow();
        expect(listCustomPaylineSets()).toEqual([]);
    });

    it("ignores malformed entries already in storage instead of throwing", () => {
        const fake = installFakeLocalStorage();
        fake.setItem("pokie-studio:custom-payline-sets", JSON.stringify([{id: "1", name: "ok but missing fields"}, "not even an object", 42]));

        expect(listCustomPaylineSets()).toEqual([]);
    });
});

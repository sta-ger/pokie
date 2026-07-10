import {clearSessionId, loadSessionId, saveSessionId, StorageLike} from "../../../cli/client/sessionStorage.js";

function createInMemoryStorage(): StorageLike {
    const map = new Map<string, string>();
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value);
        },
        removeItem: (key) => {
            map.delete(key);
        },
    };
}

describe("sessionStorage", () => {
    it("returns null when nothing has been saved yet", () => {
        const storage = createInMemoryStorage();

        expect(loadSessionId(storage)).toBeNull();
    });

    it("round-trips a saved sessionId", () => {
        const storage = createInMemoryStorage();

        saveSessionId(storage, "session-1");

        expect(loadSessionId(storage)).toBe("session-1");
    });

    it("clears a saved sessionId", () => {
        const storage = createInMemoryStorage();
        saveSessionId(storage, "session-1");

        clearSessionId(storage);

        expect(loadSessionId(storage)).toBeNull();
    });

    it("overwrites a previously saved sessionId", () => {
        const storage = createInMemoryStorage();
        saveSessionId(storage, "session-1");

        saveSessionId(storage, "session-2");

        expect(loadSessionId(storage)).toBe("session-2");
    });
});

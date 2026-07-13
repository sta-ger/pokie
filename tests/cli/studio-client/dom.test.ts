import {clearMessage, errorMessage, formatTimestamp, showMessage} from "../../../cli/studio-client/dom.js";

// jest's default testEnvironment here is "node" (no jsdom) — these are the only dom.ts exports that
// don't require a real HTMLElement/document to exercise, so a fake shape matching just the properties
// showMessage/clearMessage touch stands in for HTMLElement. Everything else in dom.ts renders against
// real queried elements and isn't unit-tested, same convention as main.ts.
function createFakeElement(): {hidden: boolean; textContent: string} {
    return {hidden: true, textContent: ""};
}

describe("errorMessage", () => {
    it("returns an Error's own message", () => {
        expect(errorMessage(new Error("boom"))).toBe("boom");
    });

    it("stringifies a non-Error thrown value", () => {
        expect(errorMessage("plain string")).toBe("plain string");
        expect(errorMessage(42)).toBe("42");
        expect(errorMessage(undefined)).toBe("undefined");
    });
});

describe("showMessage / clearMessage", () => {
    it("showMessage un-hides the element and sets its text", () => {
        const element = createFakeElement();

        showMessage(element as unknown as HTMLElement, "something went wrong");

        expect(element.hidden).toBe(false);
        expect(element.textContent).toBe("something went wrong");
    });

    it("clearMessage hides the element and empties its text", () => {
        const element = {hidden: false, textContent: "stale message"};

        clearMessage(element as unknown as HTMLElement);

        expect(element.hidden).toBe(true);
        expect(element.textContent).toBe("");
    });
});

describe("formatTimestamp", () => {
    it("formats an ISO string the same way Date#toLocaleString() would", () => {
        const iso = "2026-01-01T12:34:56.000Z";

        expect(formatTimestamp(iso)).toBe(new Date(iso).toLocaleString());
    });

    it("formats an epoch-ms number the same way", () => {
        const epochMs = 1735732800000;

        expect(formatTimestamp(epochMs)).toBe(new Date(epochMs).toLocaleString());
    });
});

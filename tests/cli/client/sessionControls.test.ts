/**
 * @jest-environment jsdom
 */
import {bindSessionControls} from "../../../cli/client/sessionControls.js";

function createElements(): {
    sessionSeed: HTMLInputElement;
    sessionId: HTMLInputElement;
    startSessionButton: HTMLButtonElement;
    restoreSessionButton: HTMLButtonElement;
    status: HTMLElement;
    } {
    return {
        sessionSeed: document.createElement("input"),
        sessionId: document.createElement("input"),
        startSessionButton: document.createElement("button"),
        restoreSessionButton: document.createElement("button"),
        status: document.createElement("p"),
    };
}

describe("bindSessionControls", () => {
    it("accepts a seeded new-session action before an initial connection has settled", () => {
        const elements = createElements();
        const started: Array<string | undefined> = [];
        bindSessionControls(elements, (seed) => started.push(seed), jest.fn());

        elements.sessionSeed.value = " fixture-round ";
        elements.startSessionButton.click();

        expect(started).toEqual(["fixture-round"]);
    });

    it("does not attempt to restore an empty session id", () => {
        const elements = createElements();
        const restore = jest.fn();
        bindSessionControls(elements, jest.fn(), restore);

        elements.restoreSessionButton.click();

        expect(restore).not.toHaveBeenCalled();
        expect(elements.status.textContent).toBe("Enter a session ID to restore it.");
    });
});

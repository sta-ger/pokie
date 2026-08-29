import {describeReplayActionError} from "../../../../../cli/studio-client/src/domain/replayActionError";

describe("describeReplayActionError", () => {
    it("replaces raw backend validation text with a specific replay recovery action", () => {
        const rawMessage = 'Request body must be a JSON object. ENOTDIR: not a directory, open "/srv/replays".';
        const explanation = describeReplayActionError("This replay", rawMessage);

        expect(explanation).toBe("This replay was rejected as invalid. Check the round/seed/artifact values entered and try again.");
        expect(explanation).not.toMatch(/ENOTDIR|\/srv\/replays|server log|stack trace/i);
    });

    it("gives a concrete retry path for an expired replay without echoing server text", () => {
        const rawMessage = 'Unknown replay id "internal-job-42"; inspect the server logs.';
        const explanation = describeReplayActionError("The replay list", rawMessage);

        expect(explanation).toBe("The replay list could no longer be found. It may have been deleted or aged out of the server's history -- refresh and try again.");
        expect(explanation).not.toMatch(/internal-job-42|server logs|unknown replay id/i);
    });

    it("preserves the safe planner runtime diagnostic and its recovery", () => {
        const diagnostic = "Cannot prepare a runnable runtime from \\\"/games/slot.par.xlsx\\\". Attempted path: parWorkbook -> tsPackage; planned/reusable stages: import blueprint; failed conversion edge: blueprint -> tsPackage. Fix the workbook and retry.";

        expect(describeReplayActionError("This replay request", diagnostic)).toBe(diagnostic);
    });
});

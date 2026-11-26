import {describeSaveManagedResult} from "../../../cli/studio-client/src/domain/interpret/BlueprintEditor.js";

describe("describeSaveManagedResult", () => {
    it("carries the existing project path behind a Game-id collision so the UI can open it", () => {
        const view = describeSaveManagedResult({
            status: "unavailable",
            error: 'A POKIE project with Game id "starter-slot" already exists at "/tmp/POKIE Projects/starter-slot/blueprint.json". Choose a different Game id, or open the existing project instead.',
            existingProjectPath: "/tmp/POKIE Projects/starter-slot/blueprint.json",
        });

        expect(view).toEqual({
            status: "failed",
            message: 'A POKIE project with Game id "starter-slot" already exists at "/tmp/POKIE Projects/starter-slot/blueprint.json". Choose a different Game id, or open the existing project instead.',
            existingProjectPath: "/tmp/POKIE Projects/starter-slot/blueprint.json",
        });
    });

    it("carries the suggested unique Game id so a collision has a one-click recovery", () => {
        const view = describeSaveManagedResult({
            status: "unavailable",
            error: 'A game design with Game id "starter-slot" already exists at "/tmp/POKIE Projects/starter-slot/blueprint.json", but it cannot be opened as a current POKIE project.',
            suggestedGameId: "starter-slot-2",
        });

        expect(view).toEqual({
            status: "failed",
            message: 'A game design with Game id "starter-slot" already exists at "/tmp/POKIE Projects/starter-slot/blueprint.json", but it cannot be opened as a current POKIE project.',
            suggestedGameId: "starter-slot-2",
        });
    });

    it("does not invent an open action for an ordinary save failure", () => {
        expect(describeSaveManagedResult({status: "error", error: "disk full"})).toEqual({status: "failed", message: "disk full"});
    });
});

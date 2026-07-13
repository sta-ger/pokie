import {confirmDangerousAction} from "../../../cli/studio-client/confirmDangerousAction.js";

describe("confirmDangerousAction", () => {
    it("returns true and forwards the message when the injected confirmImpl accepts", () => {
        const confirmImpl = jest.fn().mockReturnValue(true);

        const result = confirmDangerousAction("Stop the running runtime server?", confirmImpl);

        expect(result).toBe(true);
        expect(confirmImpl).toHaveBeenCalledWith("Stop the running runtime server?");
    });

    it("returns false when the injected confirmImpl declines", () => {
        const confirmImpl = jest.fn().mockReturnValue(false);

        const result = confirmDangerousAction("Cancel the running simulation?", confirmImpl);

        expect(result).toBe(false);
    });
});

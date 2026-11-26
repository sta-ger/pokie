import {formatOneIn} from "../../../cli/studio-client/src/domain/formatOneIn.js";

describe("formatOneIn", () => {
    it("keeps two decimals near a common outcome and groups rare ones", () => {
        expect(formatOneIn(0.75)).toBe("1.33");
        expect(formatOneIn(1 / 24)).toBe("24");
        expect(formatOneIn(1 / 3125)).toBe("3,125");
    });

    it("shows an em dash for an impossible probability", () => {
        expect(formatOneIn(0)).toBe("—");
        expect(formatOneIn(Number.NaN)).toBe("—");
    });
});

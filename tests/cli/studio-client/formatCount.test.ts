import {formatCount} from "../../../cli/studio-client/src/domain/formatCount.js";

describe("formatCount", () => {
    it("uses singular wording for one", () => {
        expect(formatCount(1, "subround")).toBe("1 subround");
        expect(formatCount(1, "delivery", "deliveries")).toBe("1 delivery");
    });

    it("uses plural wording for zero and many", () => {
        expect(formatCount(0, "subround")).toBe("0 subrounds");
        expect(formatCount(2, "delivery", "deliveries")).toBe("2 deliveries");
    });
});

import {parsePayoutInput} from "../../../cli/studio-client/src/domain/paytableInput.js";

describe("paytable payout input", () => {
    it("commits a valid non-negative number", () => {
        expect(parsePayoutInput("8", 3)).toEqual({value: 8});
        expect(parsePayoutInput(1.5, 3)).toEqual({value: 1.5});
        expect(parsePayoutInput(" 12 ", 3)).toEqual({value: 12});
        expect(parsePayoutInput("0", 3)).toEqual({value: 0});
    });

    it("never turns a blank field into a zero payout", () => {
        expect(parsePayoutInput("", 8)).toEqual({
            value: 8,
            error: "Enter a payout number. The previous value was kept.",
        });
        expect(parsePayoutInput("   ", 8).value).toBe(8);
    });

    it("keeps the previous value for non-numeric and negative drafts", () => {
        expect(parsePayoutInput("abc", 8).value).toBe(8);
        expect(parsePayoutInput("abc", 8).error).toContain("must be a number");
        expect(parsePayoutInput("-1", 8).value).toBe(8);
        expect(parsePayoutInput("-1", 8).error).toContain("cannot be negative");
    });
});

import {parseCanonicalNonNegativeInteger} from "../../../../cli/commands/internal/parseCanonicalNonNegativeInteger.js";

describe("parseCanonicalNonNegativeInteger", () => {
    it("accepts 0", () => {
        expect(parseCanonicalNonNegativeInteger("0")).toBe(0);
    });

    it("accepts an ordinary positive integer", () => {
        expect(parseCanonicalNonNegativeInteger("42")).toBe(42);
    });

    it("accepts exactly Number.MAX_SAFE_INTEGER", () => {
        expect(parseCanonicalNonNegativeInteger(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("rejects Number.MAX_SAFE_INTEGER + 1", () => {
        expect(parseCanonicalNonNegativeInteger(String(Number.MAX_SAFE_INTEGER + 1))).toBeUndefined();
    });

    it("rejects scientific notation", () => {
        expect(parseCanonicalNonNegativeInteger("1e3")).toBeUndefined();
    });

    it("rejects hexadecimal notation", () => {
        expect(parseCanonicalNonNegativeInteger("0x10")).toBeUndefined();
    });

    it("rejects a decimal value", () => {
        expect(parseCanonicalNonNegativeInteger("1.5")).toBeUndefined();
    });

    it("rejects a negative value", () => {
        expect(parseCanonicalNonNegativeInteger("-1")).toBeUndefined();
    });

    it("rejects an empty string", () => {
        expect(parseCanonicalNonNegativeInteger("")).toBeUndefined();
    });

    it("rejects whitespace", () => {
        expect(parseCanonicalNonNegativeInteger(" ")).toBeUndefined();
        expect(parseCanonicalNonNegativeInteger(" 3 ")).toBeUndefined();
    });

    it("rejects a leading zero", () => {
        expect(parseCanonicalNonNegativeInteger("01")).toBeUndefined();
    });

    it("rejects a leading plus sign", () => {
        expect(parseCanonicalNonNegativeInteger("+1")).toBeUndefined();
    });

    it("rejects the literal strings NaN/Infinity", () => {
        expect(parseCanonicalNonNegativeInteger("NaN")).toBeUndefined();
        expect(parseCanonicalNonNegativeInteger("Infinity")).toBeUndefined();
    });
});

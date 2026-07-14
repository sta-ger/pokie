import {InvalidJsonValueError, toCanonicalJson} from "pokie";

describe("toCanonicalJson", () => {
    it("passes through primitives and null unchanged", () => {
        expect(toCanonicalJson("a")).toBe("a");
        expect(toCanonicalJson(1)).toBe(1);
        expect(toCanonicalJson(true)).toBe(true);
        expect(toCanonicalJson(false)).toBe(false);
        expect(toCanonicalJson(null)).toBe(null);
    });

    it("preserves array order", () => {
        expect(toCanonicalJson([3, 1, 2])).toEqual([3, 1, 2]);
    });

    it("sorts object keys regardless of insertion order", () => {
        expect(toCanonicalJson({b: 1, a: 2})).toEqual({a: 2, b: 1});
        expect(JSON.stringify(toCanonicalJson({b: 1, a: 2}))).toBe(JSON.stringify(toCanonicalJson({a: 2, b: 1})));
    });

    it("recursively sorts nested object keys", () => {
        const canonical = toCanonicalJson({z: {d: 1, c: 2}, a: 1});
        expect(JSON.stringify(canonical)).toBe('{"a":1,"z":{"c":2,"d":1}}');
    });

    it.each([NaN, Infinity, -Infinity])("throws InvalidJsonValueError for %p", (value) => {
        expect(() => toCanonicalJson(value)).toThrow(InvalidJsonValueError);
        expect(() => toCanonicalJson({value})).toThrow(InvalidJsonValueError);
    });

    it("throws InvalidJsonValueError for undefined", () => {
        expect(() => toCanonicalJson(undefined)).toThrow(InvalidJsonValueError);
        expect(() => toCanonicalJson({value: undefined})).toThrow(InvalidJsonValueError);
    });

    it("throws InvalidJsonValueError for a symbol", () => {
        expect(() => toCanonicalJson(Symbol("x"))).toThrow(InvalidJsonValueError);
        expect(() => toCanonicalJson({value: Symbol("x")})).toThrow(InvalidJsonValueError);
    });

    it("throws InvalidJsonValueError for a bigint", () => {
        expect(() => toCanonicalJson(BigInt(1))).toThrow(InvalidJsonValueError);
        expect(() => toCanonicalJson({value: BigInt(1)})).toThrow(InvalidJsonValueError);
    });

    it("throws InvalidJsonValueError for a function", () => {
        expect(() => toCanonicalJson(() => 1)).toThrow(InvalidJsonValueError);
        expect(() => toCanonicalJson({value: () => 1})).toThrow(InvalidJsonValueError);
    });

    it("throws InvalidJsonValueError for a circular reference", () => {
        const cyclic: Record<string, unknown> = {a: 1};
        cyclic.self = cyclic;
        expect(() => toCanonicalJson(cyclic)).toThrow(/circular reference/);
    });

    it("throws InvalidJsonValueError for a circular reference nested in an array", () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(() => toCanonicalJson([1, 2, cyclic])).toThrow(/circular reference/);
    });

    it("does not treat a shared (non-circular, diamond-shaped) reference as circular", () => {
        const shared = {value: 1};
        expect(() => toCanonicalJson({left: shared, right: shared})).not.toThrow();
        expect(toCanonicalJson({left: shared, right: shared})).toEqual({left: {value: 1}, right: {value: 1}});
    });

    it("reports the path of the offending value", () => {
        try {
            toCanonicalJson({wins: [{metadata: {value: NaN}}]});
            fail("expected toCanonicalJson to throw");
        } catch (error) {
            expect(error).toBeInstanceOf(InvalidJsonValueError);
            expect((error as InvalidJsonValueError).getPath()).toBe("wins[0].metadata.value");
        }
    });
});

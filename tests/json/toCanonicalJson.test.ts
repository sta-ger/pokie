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

    describe("non-plain objects", () => {
        it("throws InvalidJsonValueError for a Date", () => {
            expect(() => toCanonicalJson(new Date())).toThrow(InvalidJsonValueError);
            expect(() => toCanonicalJson({value: new Date()})).toThrow(InvalidJsonValueError);
        });

        it("throws InvalidJsonValueError for a Map", () => {
            expect(() => toCanonicalJson(new Map([["a", 1]]))).toThrow(InvalidJsonValueError);
        });

        it("throws InvalidJsonValueError for a Set", () => {
            expect(() => toCanonicalJson(new Set([1, 2]))).toThrow(InvalidJsonValueError);
        });

        it("throws InvalidJsonValueError for a RegExp", () => {
            expect(() => toCanonicalJson(/abc/)).toThrow(InvalidJsonValueError);
        });

        it("throws InvalidJsonValueError for a class instance (custom prototype)", () => {
            class Foo {
                public value = 1;
            }
            expect(() => toCanonicalJson(new Foo())).toThrow(InvalidJsonValueError);
        });

        it("accepts a null-prototype object as a plain object", () => {
            const obj: Record<string, unknown> = Object.create(null);
            obj.a = 1;
            expect(toCanonicalJson(obj)).toEqual({a: 1});
        });
    });

    describe("symbol-keyed properties", () => {
        it("throws InvalidJsonValueError for an object with a symbol-keyed own property", () => {
            const obj: Record<string | symbol, unknown> = {a: 1};
            obj[Symbol("hidden")] = "nope";
            expect(() => toCanonicalJson(obj)).toThrow(InvalidJsonValueError);
        });
    });

    describe("sparse arrays", () => {
        it("throws InvalidJsonValueError for a sparse array (with a hole)", () => {
            const sparse = [1, 2, 3];
            Reflect.deleteProperty(sparse, 1);
            expect(() => toCanonicalJson(sparse)).toThrow(InvalidJsonValueError);
            expect(() => toCanonicalJson(sparse)).toThrow(/sparse array/);
        });

        it("distinguishes a dense array containing an explicit undefined from a sparse array", () => {
            expect(() => toCanonicalJson([1, undefined, 3])).toThrow(/undefined is not a valid JSON value/);
        });

        it("does not flag a normal dense array", () => {
            expect(() => toCanonicalJson([1, 2, 3])).not.toThrow();
        });
    });

    describe('"__proto__" handling', () => {
        it("safely preserves a '__proto__' own property without polluting the canonical object's prototype", () => {
            const protoKey = "__proto__";
            const withProtoKey = JSON.parse(`{${JSON.stringify(protoKey)}: "value", "safe": 1}`) as Record<string, unknown>;
            // Sanity: JSON.parse creates a genuine own "__proto__" data property, not an actual prototype change.
            expect(Reflect.getPrototypeOf(withProtoKey)).toBe(Object.prototype);
            expect(Reflect.apply(Object.prototype.hasOwnProperty, withProtoKey, [protoKey])).toBe(true);

            const canonical = toCanonicalJson(withProtoKey) as Record<string, unknown>;

            expect(Reflect.getPrototypeOf(canonical)).not.toBe("value");
            expect(Reflect.apply(Object.prototype.hasOwnProperty, canonical, [protoKey])).toBe(true);
            expect(canonical[protoKey]).toBe("value");
            expect(canonical.safe).toBe(1);
            expect(JSON.stringify(canonical)).toBe('{"__proto__":"value","safe":1}');
        });
    });
});

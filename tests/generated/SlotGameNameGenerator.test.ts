import {SlotGameNameExhaustedError, SlotGameNameGenerator} from "pokie";

const TITLE_PATTERN = /^[A-Z][a-z]+( [A-Z][a-z]+){1,2}$/;

describe("SlotGameNameGenerator", () => {
    test("the same seed always produces the same result", () => {
        const first = new SlotGameNameGenerator().generate({seed: 12345});
        const second = new SlotGameNameGenerator().generate({seed: 12345});

        expect(second).toEqual(first);
    });

    test("different seeds usually produce different titles", () => {
        const generator = new SlotGameNameGenerator();
        const titles = [1, 2, 3, 4, 5].map((seed) => generator.generate({seed}).title);

        expect(new Set(titles).size).toBeGreaterThan(1);
    });

    test("omitting the request still returns a well-formed, non-deterministic result", () => {
        const generator = new SlotGameNameGenerator();
        const a = generator.generate();
        const b = generator.generate();

        expect(a.title).toMatch(TITLE_PATTERN);
        expect(b.title).toMatch(TITLE_PATTERN);
    });

    test("the title is a Title Case, 2-3 word name", () => {
        const {title} = new SlotGameNameGenerator().generate({seed: 999});
        expect(title).toMatch(TITLE_PATTERN);
    });

    describe("projections", () => {
        test("title, slug, and packageName are distinct, related projections", () => {
            const {title, slug, packageName} = new SlotGameNameGenerator().generate({seed: 777});

            expect(title).not.toBe(packageName);
            expect(slug).not.toBe(packageName);
            expect(packageName).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
            expect(slug).toBe(`${packageName}-${slug.slice(packageName.length + 1)}`);
            expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*-\d{4}$/);
        });

        test("the same title always yields the same packageName, but slug varies (numeric suffix)", () => {
            const vocabulary = {adjectives: ["Only"], nouns: ["Option"]};
            const first = new SlotGameNameGenerator().generate({seed: 1, vocabulary, wordCount: 2});
            const second = new SlotGameNameGenerator().generate({seed: 2, vocabulary, wordCount: 2});

            expect(first.title).toBe("Only Option");
            expect(second.title).toBe("Only Option");
            expect(first.packageName).toBe(second.packageName);
            expect(first.packageName).toBe("only-option");
        });
    });

    describe("theme and style", () => {
        test("an explicit theme always supplies the noun, and an explicit style always supplies the adjective(s)", () => {
            for (const seed of [1, 2, 3, 4, 5]) {
                const {title} = new SlotGameNameGenerator().generate({seed, theme: "cosmic", style: "elegant", wordCount: 2});
                const [adjective, noun] = title.split(" ");

                expect(["Radiant", "Opulent", "Serene", "Velvet", "Pristine", "Refined", "Gilded", "Graceful"]).toContain(adjective);
                expect(["Nebula", "Galaxy", "Nova", "Eclipse", "Orbit", "Comet", "Starfall", "Meteor"]).toContain(noun);
            }
        });
    });

    describe("wordCount", () => {
        test("wordCount: 2 always produces a two-word title", () => {
            const {title} = new SlotGameNameGenerator().generate({seed: 4, wordCount: 2});
            expect(title.split(" ")).toHaveLength(2);
        });

        test("wordCount: 3 always produces a three-word title", () => {
            const {title} = new SlotGameNameGenerator().generate({seed: 4, wordCount: 3});
            expect(title.split(" ")).toHaveLength(3);
        });
    });

    describe("exclusions", () => {
        test("never returns an excluded title, matching case-insensitively", () => {
            const vocabulary = {adjectives: ["Only"], nouns: ["Option"]};
            expect(() =>
                new SlotGameNameGenerator().generate({seed: 1, vocabulary, wordCount: 2, exclusions: ["only option"]}),
            ).toThrow(SlotGameNameExhaustedError);
        });
    });

    describe("custom vocabulary", () => {
        test("every word comes from the supplied vocabulary, never the built-in theme/style pools", () => {
            const vocabulary = {adjectives: ["Zippy"], nouns: ["Zapper"]};
            for (const seed of [1, 2, 3]) {
                const {title} = new SlotGameNameGenerator().generate({seed, vocabulary, wordCount: 2});
                expect(title).toBe("Zippy Zapper");
            }
        });
    });

    describe("generateUnique", () => {
        test("produces the requested count of results with pairwise-distinct titles", () => {
            const results = new SlotGameNameGenerator().generateUnique(5, {seed: 42});

            expect(results).toHaveLength(5);
            expect(new Set(results.map((result) => result.title)).size).toBe(5);
        });

        test("every result echoes the same batch seed", () => {
            const results = new SlotGameNameGenerator().generateUnique(3, {seed: 10});
            expect(results.every((result) => result.seed === 10)).toBe(true);
        });

        test("the same seed reproduces the exact same batch", () => {
            const first = new SlotGameNameGenerator().generateUnique(4, {seed: 55});
            const second = new SlotGameNameGenerator().generateUnique(4, {seed: 55});

            expect(second).toEqual(first);
        });

        test("throws SlotGameNameExhaustedError when the vocabulary can't satisfy uniqueness", () => {
            const vocabulary = {adjectives: ["Only"], nouns: ["Option"]};
            expect(() => new SlotGameNameGenerator().generateUnique(2, {seed: 1, vocabulary, wordCount: 2})).toThrow(
                SlotGameNameExhaustedError,
            );
        });

        test("rejects a non-positive count", () => {
            expect(() => new SlotGameNameGenerator().generateUnique(0)).toThrow(RangeError);
        });
    });
});

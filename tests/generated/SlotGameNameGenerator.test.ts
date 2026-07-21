import {SlotGameNameGenerator} from "pokie";

describe("SlotGameNameGenerator", () => {
    test("the same seed always produces the same {id, name}", () => {
        const first = new SlotGameNameGenerator().generate(12345);
        const second = new SlotGameNameGenerator().generate(12345);

        expect(second).toEqual(first);
    });

    test("different seeds usually produce different names", () => {
        const generator = new SlotGameNameGenerator();
        const names = [1, 2, 3, 4, 5].map((seed) => generator.generate(seed).name);

        expect(new Set(names).size).toBeGreaterThan(1);
    });

    test("the id is a lowercase, hyphenated, directory-safe slug with a numeric suffix", () => {
        const {id} = new SlotGameNameGenerator().generate(777);

        expect(id).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
    });

    test("the name is a capitalized 'Adjective Noun' pair matching the id's words", () => {
        const {id, name} = new SlotGameNameGenerator().generate(999);
        const [adjective, noun] = name.split(" ");

        expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
        expect(id).toBe(`${adjective.toLowerCase()}-${noun.toLowerCase()}-${id.split("-")[2]}`);
    });

    test("omitting the seed still returns a well-formed name (non-deterministic across calls)", () => {
        const generator = new SlotGameNameGenerator();
        const a = generator.generate();
        const b = generator.generate();

        expect(a.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
        expect(b.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    });
});

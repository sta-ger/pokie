import {SlotGameNameGenerator} from "pokie";

// SlotGameNameGenerator.test.ts only checks reproducibility ("same seed -> toEqual") and shape (regex
// patterns), or pins exact strings using a minimal custom vocabulary chosen to make the outcome
// predictable by construction. Neither exercises the actual built-in theme/style word pools end-to-end.
// This pins the exact title/slug/packageName a known seed produces from those built-in pools, so a
// change to the pools, the theme/style selection, the word-count coin flip, or the slug suffix range
// that still passes the existing shape/reproducibility checks gets caught.
describe("SlotGameNameGenerator golden seeds", () => {
    test.each([
        {seed: 12345, title: "Volcanic Howl", packageName: "volcanic-howl", slug: "volcanic-howl-4127"},
        {seed: 1, title: "Prime Crown Olympus", packageName: "prime-crown-olympus", slug: "prime-crown-olympus-6515"},
    ])("seed $seed always produces the exact same title, packageName, and slug", ({seed, title, packageName, slug}) => {
        expect(new SlotGameNameGenerator().generate({seed})).toEqual({title, packageName, slug, seed});
    });
});

export type SlotGameNameResult = {
    // Display name, e.g. "Blazing Riches" -- Title Case, space-joined, 2-3 words.
    title: string;
    // Directory/manifest-id-safe projection with a numeric suffix, e.g. "blazing-riches-4821" -- the
    // suffix exists so repeated unseeded calls that land on the same title don't collide on one path.
    slug: string;
    // npm-package-name-safe projection with no numeric suffix, e.g. "blazing-riches". Unlike `slug`,
    // the same `title` always yields the same `packageName`.
    packageName: string;
    // The seed actually used -- echoes back the caller's own seed unchanged, or the one this call (or
    // batch, for generateUnique) minted for itself when none was given.
    seed: number;
};

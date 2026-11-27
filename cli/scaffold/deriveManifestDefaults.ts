export type ManifestDefaults = {
    id: string;
    name: string;
    className: string;
};

const FALLBACK_ID = "my-game";

export function deriveManifestDefaults(packageName: string | undefined): ManifestDefaults {
    const trimmed = packageName?.trim();
    const rawId = trimmed && trimmed.length > 0 ? trimmed : FALLBACK_ID;
    const displayId = rawId.startsWith("@") && rawId.includes("/") ? rawId.slice(rawId.indexOf("/") + 1) : rawId;

    // A display name such as "My Game" is a valid game name but not a valid npm package name.
    // Keep the human-readable words for the title/class, and use a words-only lowercase slug for
    // the package id that package.json and the default output filename actually carry.
    const id = displayId
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "") || FALLBACK_ID;

    const capitalizedWords = displayId
        .split(/[-_\s]+/)
        .filter((word) => word.length > 0)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

    const name = capitalizedWords.join(" ");
    const className = capitalizedWords.join("");

    return {
        id,
        name: name.length > 0 ? name : id,
        className: className.length > 0 ? className : "MyGame",
    };
}

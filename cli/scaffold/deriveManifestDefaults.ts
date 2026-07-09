export type ManifestDefaults = {
    id: string;
    name: string;
    className: string;
};

const FALLBACK_ID = "my-game";

export function deriveManifestDefaults(packageName: string | undefined): ManifestDefaults {
    const trimmed = packageName?.trim();
    const rawId = trimmed && trimmed.length > 0 ? trimmed : FALLBACK_ID;
    const id = rawId.startsWith("@") && rawId.includes("/") ? rawId.slice(rawId.indexOf("/") + 1) : rawId;

    const capitalizedWords = id
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

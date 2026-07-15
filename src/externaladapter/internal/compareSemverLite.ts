const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)/;

// A deliberately minimal major.minor.patch comparator — not a full semver implementation (no pre-release/build
// metadata precedence rules), since POKIE has no semver dependency and every pokieVersion this package itself
// produces (see package.json's own "version") is already a plain "x.y.z". Only the leading "x.y.z" of each
// string is read (a trailing "-beta.1" or "+build5" is ignored, not rejected), so this is intentionally lenient
// about anything past the numeric core. Returns undefined — never throws — when either string doesn't even
// start with "x.y.z", so a caller can tell "not comparable" apart from "compared equal".
export function compareSemverLite(a: string, b: string): number | undefined {
    const parsedA = VERSION_PATTERN.exec(a.trim());
    const parsedB = VERSION_PATTERN.exec(b.trim());
    if (parsedA === null || parsedB === null) {
        return undefined;
    }

    for (let i = 1; i <= 3; i++) {
        const diff = Number(parsedA[i]) - Number(parsedB[i]);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}

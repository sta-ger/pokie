// Commander accepts `--out=` as a present option with an empty value. Several commands previously
// treated that as "no --out at all" (silently writing nothing), and `pokie build`/Stake import resolved
// it to the current directory. An explicitly supplied option value must never mean "omitted": reject it
// while parsing, before any project resolution or filesystem work can start.
export function parseNonEmptyPathOption(
    flag: string,
    usage: string,
    noun: "file" | "directory" | "output" = "file",
): (value: string) => string {
    return (value) => {
        if (value.trim().length === 0) {
            throw new Error(`${flag} requires a non-empty ${noun} path. ${usage}`);
        }
        return value;
    };
}

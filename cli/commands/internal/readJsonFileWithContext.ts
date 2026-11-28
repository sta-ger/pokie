// A raw JSON.parse diagnostic ("Expected property name...") names neither the file nor what the file
// was supposed to contain. Every user-facing JSON input gets the same actionable wrapper instead.
export function readJsonFileWithContext<T = unknown>(
    readJson: (file: string) => unknown,
    file: string,
    subject: string,
): T {
    try {
        return readJson(file) as T;
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Could not read ${subject} "${file}": ${detail}. ` +
                "Check that the file exists and contains valid JSON, then retry.",
        );
    }
}

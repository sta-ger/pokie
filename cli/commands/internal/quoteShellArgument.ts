const SAFE_SHELL_ARGUMENT = /^[A-Za-z0-9_./:@%+=,-]+$/;

/**
 * Quotes a path or other user-supplied value for copy-paste into the shell that launched this CLI.
 * Safe single tokens stay readable; everything else is escaped for the current platform rather than
 * printed as a command that silently splits at spaces.
 */
export function quoteShellArgument(value: string): string {
    if (value.length > 0 && SAFE_SHELL_ARGUMENT.test(value)) return value;
    if (process.platform === "win32") return `"${value.replace(/"/g, '\\"')}"`;
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

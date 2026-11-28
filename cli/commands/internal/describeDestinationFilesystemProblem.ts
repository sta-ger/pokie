// Filesystem failures while inspecting a destination are caller-input outcomes, not server failures. Keep the
// raw OS code in logs/technical surfaces, but give Studio's file controls an actionable sentence they can show.
export function describeDestinationFilesystemProblem(destination: string, error: unknown): string | undefined {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    switch (code) {
        case "ENOTDIR":
            return `"${destination}" is inside a file, not a folder. Choose a different file name or folder.`;
        case "ENAMETOOLONG":
            return `"${destination}" is too long for this filesystem. Use a shorter file name or folder.`;
        case "EACCES":
        case "EPERM":
            return `POKIE doesn't have permission to use "${destination}". Choose a different location or fix its permissions.`;
        case "EROFS":
            return `"${destination}" is on a read-only location. Choose a writable location.`;
        case "ENOSPC":
            return `There is not enough space to create "${destination}". Free some space or choose another location.`;
        case "ELOOP":
            return `"${destination}" has too many linked folders. Choose a different location.`;
        default:
            return undefined;
    }
}

import childProcess from "child_process";
import util from "util";
import {defaultPlatformDirectoryEnvironment, PlatformDirectoryEnvironment} from "../../paths/PlatformDirectoryEnvironment.js";

const execFileAsync = util.promisify(childProcess.execFile);

export type StudioNativePickerKind = "directory" | "file";
export type StudioNativePickerMode = "open" | "save";

export type StudioNativePickerFileFilter = {name: string; extensions: string[]};

export type StudioNativePickerRequest = {
    kind: StudioNativePickerKind;
    // A file destination is not an existing file to open.  Keep that distinction in the host bridge so
    // Save/Export never misleadingly opens an "Open file" dialog just because both values are paths.
    mode?: StudioNativePickerMode;
    startPath?: string;
    fileFilters?: StudioNativePickerFileFilter[];
};

// Whether this same machine can show a native OS dialog at all -- see checkAvailability() below.
// "unavailable" is an expected, common outcome (a headless/remote/CI host with no display), never an
// error: the caller (PathInput, via /api/home/fs/native-browse) falls back to the honestly-labelled
// PathBrowseModal ("Server filesystem browser") whenever this comes back unavailable.
export type StudioNativePickerAvailabilityView = {status: "available"} | {status: "unavailable"; reason: string};

export type StudioNativePickerResultView =
    | {status: "selected"; path: string}
    | {status: "cancelled"}
    | {status: "unavailable"; reason: string}
    | {status: "error"; message: string};

export type RunNativeCommandResult = {stdout: string; stderr: string};
export type RunNativeCommand = (command: string, args: string[]) => Promise<RunNativeCommandResult>;

type LinuxToolOutcome = StudioNativePickerResultView | "not-found";

// Opens a real, system-native folder/file dialog on the machine running Studio's server -- since Studio
// is a single-user local tool (see StudioServer's own class doc comment), that machine is ordinarily the
// user's own desktop, so this is the "local" path/picker the browser itself can never provide (browsers
// deliberately never expose real OS filesystem paths back to a page -- see StudioFsBrowseService's own
// doc comment on why Browse already goes through the server). Every OS command is run via execFile with
// an argument array (zenity/kdialog) or a single script argument (osascript/powershell) -- never through
// a shell -- so an arbitrary startPath (which may contain quotes, `$()`, backticks, ...) can never be
// interpreted as a second command. `run` is injectable so tests never spawn a real process.
export class StudioNativePickerService {
    private readonly env: PlatformDirectoryEnvironment;
    private readonly run: RunNativeCommand;

    constructor(
        env: PlatformDirectoryEnvironment = defaultPlatformDirectoryEnvironment(),
        run: RunNativeCommand = (command, args) => execFileAsync(command, args),
    ) {
        this.env = env;
        this.run = run;
    }

    // Every platform except headless Linux is treated as available: macOS and Windows are always
    // graphical desktop OSes for a locally-run Studio, so the only real "no native dialog possible" case
    // left is a Linux host with no X11/Wayland display attached (a container, a CI runner, an SSH
    // session without X forwarding).
    public checkAvailability(): StudioNativePickerAvailabilityView {
        if (this.env.platform === "linux" && !this.hasLinuxDisplay()) {
            return {
                status: "unavailable",
                reason: "No graphical display was detected on the machine running Studio's server (DISPLAY/WAYLAND_DISPLAY is not set).",
            };
        }
        return {status: "available"};
    }

    public pick(request: StudioNativePickerRequest): Promise<StudioNativePickerResultView> {
        const availability = this.checkAvailability();
        if (availability.status === "unavailable") {
            return Promise.resolve(availability);
        }
        if (this.env.platform === "darwin") {
            return this.pickDarwin(request);
        }
        if (this.env.platform === "win32") {
            return this.pickWindows(request);
        }
        return this.pickLinux(request);
    }

    private hasLinuxDisplay(): boolean {
        const display = this.env.env.DISPLAY;
        const wayland = this.env.env.WAYLAND_DISPLAY;
        return isNonEmpty(display) || isNonEmpty(wayland);
    }

    private async pickDarwin(request: StudioNativePickerRequest): Promise<StudioNativePickerResultView> {
        try {
            const {stdout} = await this.run("osascript", ["-e", buildAppleScript(request)]);
            const selectedPath = stdout.trim();
            return selectedPath.length > 0 ? {status: "selected", path: selectedPath} : {status: "error", message: "osascript returned no path."};
        } catch (error) {
            if (isDarwinCancellation(error)) {
                return {status: "cancelled"};
            }
            return {status: "error", message: describeCommandError(error)};
        }
    }

    private async pickWindows(request: StudioNativePickerRequest): Promise<StudioNativePickerResultView> {
        try {
            const {stdout} = await this.run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", buildPowerShellScript(request)]);
            const line = stdout.trim();
            if (line === "POKIE_CANCELLED") {
                return {status: "cancelled"};
            }
            if (line.startsWith("POKIE_SELECTED:")) {
                return {status: "selected", path: line.slice("POKIE_SELECTED:".length)};
            }
            return {status: "error", message: "powershell.exe returned an unexpected result."};
        } catch (error) {
            return {status: "error", message: describeCommandError(error)};
        }
    }

    private async pickLinux(request: StudioNativePickerRequest): Promise<StudioNativePickerResultView> {
        const zenityOutcome = await this.runLinuxTool("zenity", buildZenityArgs(request));
        if (zenityOutcome !== "not-found") {
            return zenityOutcome;
        }
        const kdialogOutcome = await this.runLinuxTool("kdialog", buildKdialogArgs(request));
        if (kdialogOutcome !== "not-found") {
            return kdialogOutcome;
        }
        return {status: "unavailable", reason: "No native file dialog tool (zenity or kdialog) is installed on the machine running Studio's server."};
    }

    private async runLinuxTool(command: string, args: string[]): Promise<LinuxToolOutcome> {
        try {
            const {stdout} = await this.run(command, args);
            const selectedPath = stdout.trim();
            return selectedPath.length > 0 ? {status: "selected", path: selectedPath} : {status: "cancelled"};
        } catch (error) {
            // execFile's own error carries `.code` as either a string (a spawn failure, e.g. "ENOENT")
            // or the process's numeric exit code -- NodeJS.ErrnoException only declares the string case,
            // so this reads it through a wider local type instead of that one.
            const code = (error as {code?: string | number} | undefined)?.code;
            if (code === "ENOENT") {
                return "not-found";
            }
            // zenity/kdialog both exit 1 on a plain Cancel click, with no stdout -- indistinguishable
            // from (and handled the same as) the empty-stdout branch above, so this only covers the case
            // where the tool exits non-zero without going through that branch (e.g. no stdout captured
            // because the whole command failed to run to completion).
            if (code === 1) {
                return {status: "cancelled"};
            }
            return {status: "error", message: describeCommandError(error)};
        }
    }
}

function isNonEmpty(value: string | undefined): boolean {
    return value !== undefined && value.trim().length > 0;
}

function describeCommandError(error: unknown): string {
    const stderr = (error as {stderr?: unknown} | undefined)?.stderr;
    if (typeof stderr === "string" && stderr.trim().length > 0) {
        return stderr.trim();
    }
    return error instanceof Error ? error.message : String(error);
}

// AppleScript's `choose folder`/`choose file` raise error -128 ("User canceled.") when the user clicks
// Cancel, which osascript reports as a non-zero exit with that text on stderr.
function isDarwinCancellation(error: unknown): boolean {
    const stderr = (error as {stderr?: unknown} | undefined)?.stderr;
    return typeof stderr === "string" && (stderr.includes("-128") || (/user canceled/i).test(stderr));
}

function escapeAppleScriptString(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// `default location` seeds the dialog's start folder and "recent locations" list; create-folder,
// keyboard navigation and Cancel are all the native dialog's own built-in behavior -- nothing here needs
// to (or safely could) reimplement them. AppleScript's `choose file`/`choose folder` don't offer an
// extension-filter argument the way Windows/zenity/kdialog do, so fileFilters is intentionally unused
// here.
function buildAppleScript(request: StudioNativePickerRequest): string {
    const startClause = request.startPath ? ` default location (POSIX file "${escapeAppleScriptString(request.startPath)}")` : "";
    let prompt = "Select a file";
    let command = "choose file";
    if (request.kind === "directory") {
        prompt = "Select a folder";
        command = "choose folder";
    } else if (request.mode === "save") {
        prompt = "Save file as";
        command = "choose file name";
    }
    return `set chosenItem to ${command}${startClause} with prompt "${prompt}"\nreturn POSIX path of chosenItem`;
}

// Single-quoted PowerShell strings never interpret variable expansion or escape sequences -- the only
// character that needs neutralizing is an embedded `'`, doubled per PowerShell's own quoting rule. Both
// dialogs default `ShowNewFolderButton`/multiselect off and rely on .NET's own Explorer-backed dialogs
// for recent locations and keyboard access.
function escapePowerShellString(value: string): string {
    return value.replace(/'/g, "''");
}

function buildWindowsFilterString(fileFilters: StudioNativePickerFileFilter[] | undefined): string {
    if (!fileFilters || fileFilters.length === 0) {
        return "All files (*.*)|*.*";
    }
    return fileFilters.map((filter) => `${filter.name} (${filter.extensions.map((ext) => `*.${ext}`).join(";")})|${filter.extensions.map((ext) => `*.${ext}`).join(";")}`).join("|");
}

function buildPowerShellScript(request: StudioNativePickerRequest): string {
    const startPath = request.startPath ? escapePowerShellString(request.startPath) : undefined;
    if (request.kind === "directory") {
        return [
            "Add-Type -AssemblyName System.Windows.Forms",
            "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
            "$dialog.ShowNewFolderButton = $true",
            startPath ? `$dialog.SelectedPath = '${startPath}'` : "",
            "$result = $dialog.ShowDialog()",
            "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output ('POKIE_SELECTED:' + $dialog.SelectedPath) } else { Write-Output 'POKIE_CANCELLED' }",
        ]
            .filter((line) => line.length > 0)
            .join("\n");
    }
    return [
        "Add-Type -AssemblyName System.Windows.Forms",
        `$dialog = New-Object System.Windows.Forms.${request.mode === "save" ? "SaveFileDialog" : "OpenFileDialog"}`,
        `$dialog.Filter = '${escapePowerShellString(buildWindowsFilterString(request.fileFilters))}'`,
        startPath ? `$dialog.InitialDirectory = '${startPath}'` : "",
        "$result = $dialog.ShowDialog()",
        "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output ('POKIE_SELECTED:' + $dialog.FileName) } else { Write-Output 'POKIE_CANCELLED' }",
    ]
        .filter((line) => line.length > 0)
        .join("\n");
}

// zenity/kdialog take every value as its own argv element (execFile, never a shell) -- a startPath or
// filter name containing spaces/quotes/globs is passed through to the dialog process verbatim, never
// re-parsed by anything in between.
function buildZenityArgs(request: StudioNativePickerRequest): string[] {
    const args = ["--file-selection"];
    if (request.kind === "directory") {
        args.push("--directory");
    } else if (request.mode === "save") {
        args.push("--save", "--confirm-overwrite");
    }
    if (request.startPath) {
        // Zenity's Save dialog accepts a full suggested filename, whereas its open/directory dialogs
        // interpret --filename as a starting folder and need the trailing slash.
        let initialPath = request.startPath;
        if (request.mode !== "save" && !initialPath.endsWith("/")) {
            initialPath = `${initialPath}/`;
        }
        args.push(`--filename=${initialPath}`);
    }
    for (const filter of request.fileFilters ?? []) {
        args.push(`--file-filter=${filter.name} | ${filter.extensions.map((ext) => `*.${ext}`).join(" ")}`);
    }
    return args;
}

function buildKdialogArgs(request: StudioNativePickerRequest): string[] {
    if (request.kind === "directory") {
        return ["--getexistingdirectory", request.startPath ?? "."];
    }
    const args = [request.mode === "save" ? "--getsavefilename" : "--getopenfilename", request.startPath ?? "."];
    if (request.fileFilters && request.fileFilters.length > 0) {
        args.push(request.fileFilters.map((filter) => `${filter.extensions.map((ext) => `*.${ext}`).join(" ")}|${filter.name}`).join("\n"));
    }
    return args;
}

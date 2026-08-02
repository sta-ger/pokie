import {execFile} from "child_process";
import util from "util";

const execFileAsync = util.promisify(execFile);

export type PackageCommandResult = {stdout: string; stderr: string};

// `cwd` is always the package's own project root -- never a shell string, so `args` (e.g. "install",
// or "run"/"build") is never interpreted for shell metacharacters.
export type PackageCommandRunning = (command: string, args: string[], cwd: string) => Promise<PackageCommandResult>;

// Real npm install/build execution, injected as GamePackagePreparer's own runCommand so tests can
// assert exactly which commands would run (and in what order) without actually invoking npm.
export const runPackageCommand: PackageCommandRunning = async (command, args, cwd) => {
    const {stdout, stderr} = await execFileAsync(command, args, {cwd});
    return {stdout: stdout.toString(), stderr: stderr.toString()};
};

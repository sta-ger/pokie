import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Keep the browser suite's fake Home out of the developer's real home and out of the repository.
export default function globalTeardown(): void {
    fs.rmSync(path.join(os.homedir(), ".pokie-e2e-home"), {recursive: true, force: true});
}

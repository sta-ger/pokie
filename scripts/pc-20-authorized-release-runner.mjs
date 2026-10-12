/** Historical PC-20 receipts remain readable; this checkout never authorizes a new publication.
 * This boundary refuses before credentials, network, Git, npm, or receipt writes are consulted.
 */
import path from "node:path";
import {fileURLToPath} from "node:url";

export async function runAuthorizedPc20Lifecycle() {
    throw new Error("Public publication is disabled for FromStan/POKIE. Campaign completion and historical credentials cannot authorize npm publish.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runAuthorizedPc20Lifecycle().catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}

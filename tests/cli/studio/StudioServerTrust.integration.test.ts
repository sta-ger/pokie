import fs from "fs";
import os from "os";
import path from "path";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";

describe("Studio remote origin trust policy", () => {
    it("does not treat a regex-valid Host plus matching Origin as remote authority", async () => {
        const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-trust-"));
        fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>studio</html>");
        fs.writeFileSync(path.join(studioRoot, "main.js"), "");
        fs.writeFileSync(path.join(studioRoot, "style.css"), "");
        const home = new StudioHomeService("1.3.0");
        const server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService: home,
            blueprintService: new StudioBlueprintService("1.3.0", studioRoot, home),
            isLoopbackRequest: () => false,
        });
        try {
            const address = await server.start();
            const origin = `http://${address.host}:${address.port}`;
            const response = await fetch(`${origin}/api/home/projects/open`, {
                method: "POST",
                headers: {"Content-Type": "application/json", Origin: origin},
                body: JSON.stringify({projectRoot: "."}),
            });

            expect(response.status).toBe(403);
            await expect(response.json()).resolves.toEqual({error: "Remote Studio API writes require an explicitly trusted Studio origin."});
        } finally {
            await server.stop();
            fs.rmSync(studioRoot, {recursive: true, force: true});
        }
    });
});

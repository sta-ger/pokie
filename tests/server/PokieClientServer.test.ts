import {PokieClientServer} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";

async function get(url: string): Promise<{status: number; contentType: string | null; body: string}> {
    const response = await fetch(url);
    return {status: response.status, contentType: response.headers.get("content-type"), body: await response.text()};
}

describe("PokieClientServer", () => {
    let clientRoot: string;
    let server: PokieClientServer;
    let baseUrl: string;

    beforeEach(async () => {
        clientRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-client-server-test-"));
        fs.writeFileSync(path.join(clientRoot, "index.html"), "<html>preview</html>");
        fs.writeFileSync(path.join(clientRoot, "main.js"), "console.log('hi');");
        fs.writeFileSync(path.join(clientRoot, "style.css"), "body { margin: 0; }");

        server = new PokieClientServer(clientRoot, {host: "127.0.0.1", port: 0});
        const address = await server.start();
        baseUrl = `http://${address.host}:${address.port}`;
    });

    afterEach(async () => {
        await server.stop();
        fs.rmSync(clientRoot, {recursive: true, force: true});
    });

    it("serves index.html for GET /", async () => {
        const {status, contentType, body} = await get(`${baseUrl}/`);

        expect(status).toBe(200);
        expect(contentType).toContain("text/html");
        expect(body).toBe("<html>preview</html>");
    });

    it("serves a .js file with a JavaScript content-type", async () => {
        const {status, contentType, body} = await get(`${baseUrl}/main.js`);

        expect(status).toBe(200);
        expect(contentType).toContain("javascript");
        expect(body).toBe("console.log('hi');");
    });

    it("serves a .css file with a CSS content-type", async () => {
        const {status, contentType} = await get(`${baseUrl}/style.css`);

        expect(status).toBe(200);
        expect(contentType).toContain("text/css");
    });

    it("returns 404 for a file that doesn't exist", async () => {
        const {status} = await get(`${baseUrl}/does-not-exist.js`);

        expect(status).toBe(404);
    });

    it("returns 404 instead of leaking a file outside clientRoot via path traversal", async () => {
        const outsideFile = path.join(os.tmpdir(), "pokie-client-server-traversal-marker.txt");
        fs.writeFileSync(outsideFile, "should never be served");

        const {status} = await get(`${baseUrl}/../${path.basename(outsideFile)}`);

        expect(status).toBe(404);
        fs.rmSync(outsideFile, {force: true});
    });

    it("returns 405 for a non-GET method", async () => {
        const response = await fetch(`${baseUrl}/`, {method: "POST"});

        expect(response.status).toBe(405);
    });

    it("GET /config reflects the default api address when none is configured", async () => {
        const {status, body} = await get(`${baseUrl}/config`);

        expect(status).toBe(200);
        expect(JSON.parse(body)).toEqual({apiBaseUrl: "http://127.0.0.1:3000"});
    });

    it("GET /config reflects a configured api address", async () => {
        const configuredServer = new PokieClientServer(clientRoot, {
            host: "127.0.0.1",
            port: 0,
            apiAddress: {host: "127.0.0.1", port: 4123},
        });
        const address = await configuredServer.start();

        const {body} = await get(`http://${address.host}:${address.port}/config`);

        expect(JSON.parse(body)).toEqual({apiBaseUrl: "http://127.0.0.1:4123"});

        await configuredServer.stop();
    });
});

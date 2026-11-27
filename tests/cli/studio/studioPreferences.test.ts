import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {StudioPreferencesService} from "../../../cli/studio/preferences/StudioPreferencesService.js";

describe("StudioPreferencesService", () => {
    let directory: string;
    const file = (): string => path.join(directory, "studio-preferences.json");

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-preferences-"));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("persists volatility bands atomically and reads them from a fresh instance", () => {
        const first = new StudioPreferencesService(file());
        expect(first.get()).toEqual({});
        expect(first.saveVolatilityBands({lowMax: 1.5, mediumMax: 4.5})).toEqual({lowMax: 1.5, mediumMax: 4.5});
        expect(first.get()).toEqual({volatilityBands: {lowMax: 1.5, mediumMax: 4.5}});

        const second = new StudioPreferencesService(file());
        expect(second.get()).toEqual({volatilityBands: {lowMax: 1.5, mediumMax: 4.5}});
        second.clearVolatilityBands();
        expect(second.get()).toEqual({});
        expect(new StudioPreferencesService(file()).get()).toEqual({});
    });

    it("rejects invalid or inverted boundaries without touching the saved value", () => {
        const service = new StudioPreferencesService(file());
        service.saveVolatilityBands({lowMax: 2, mediumMax: 5});
        expect(() => service.saveVolatilityBands({lowMax: 5, mediumMax: 2})).toThrow(/medium boundary above/i);
        expect(() => service.saveVolatilityBands({lowMax: -1, mediumMax: 5})).toThrow(/medium boundary above/i);
        expect(service.get()).toEqual({volatilityBands: {lowMax: 2, mediumMax: 5}});
    });

    it("falls back to an empty view when the file is unreadable", () => {
        fs.mkdirSync(directory, {recursive: true});
        fs.writeFileSync(file(), "{not json", "utf8");
        expect(new StudioPreferencesService(file()).get()).toEqual({});
    });
});

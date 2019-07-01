import {IReelGameWithFreeGamesSessionConfig} from "./IReelGameWithFreeGamesSessionConfig";
import {ReelGameWithFreeGamesSessionConfig} from "./ReelGameWithFreeGamesSessionConfig";

describe("ReelGameSessionConfig", () => {

    it("creates default config", () => {
        const conf: IReelGameWithFreeGamesSessionConfig = new ReelGameWithFreeGamesSessionConfig();
        expect(conf.freeGamesForScatters).toEqual({
            S: {
                3: 10,
            },
        });
    });

});

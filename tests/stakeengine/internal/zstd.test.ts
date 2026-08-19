import {decompressZstdSync, encodeRawZstdFrame} from "../../../src/stakeengine/internal/zstd.js";

describe("raw Zstandard compatibility frame", () => {
    it("is decoded by POKIE's native-or-compatibility decoder", () => {
        const content = Buffer.from("Stake Engine books remain valid on runtimes without native zstd.", "utf-8");

        expect(decompressZstdSync(encodeRawZstdFrame(content))).toEqual(content);
    });

    it("represents empty content as one final raw block", () => {
        expect(decompressZstdSync(encodeRawZstdFrame(Buffer.alloc(0)))).toEqual(Buffer.alloc(0));
    });
});

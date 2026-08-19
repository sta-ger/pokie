import zlib from "zlib";
import {encodeRawZstdFrame} from "../../../src/stakeengine/internal/zstd.js";

describe("raw Zstandard compatibility frame", () => {
    it("is accepted by Node's native Zstandard decoder", () => {
        const content = Buffer.from("Stake Engine books remain valid on runtimes without native zstd.", "utf-8");

        expect(zlib.zstdDecompressSync(encodeRawZstdFrame(content))).toEqual(content);
    });

    it("represents empty content as one final raw block", () => {
        expect(zlib.zstdDecompressSync(encodeRawZstdFrame(Buffer.alloc(0)))).toEqual(Buffer.alloc(0));
    });
});

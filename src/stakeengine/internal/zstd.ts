import zlib from "zlib";

const ZSTD_MAGIC = 0xfd2fb528;
const MAX_RAW_BLOCK_SIZE = 0x1fffff;

type ZstdBindings = typeof zlib & {
    readonly zstdCompressSync?: (buffer: Buffer) => Buffer;
    readonly zstdDecompressSync?: (buffer: Buffer) => Buffer;
};

// Node added native zstd in v22.15. Older supported runtimes still need to produce Stake's
// required .zst files, so they use Zstandard's standard raw-block representation. Raw blocks are
// valid Zstandard frames (and can be consumed by native zstd implementations); they simply trade
// compression ratio for compatibility until a native compressor is available.
export function compressZstdSync(buffer: Buffer): Buffer {
    const nativeCompress = (zlib as ZstdBindings).zstdCompressSync;
    return nativeCompress === undefined ? encodeRawZstdFrame(buffer) : nativeCompress(buffer);
}

// Native zstd remains the general decoder. The Node 18 fallback deliberately accepts the raw
// frames this package writes there, preserving the exporter/importer round trip without claiming
// to decode arbitrary compressed frames when no zstd decoder exists in that runtime.
export function decompressZstdSync(buffer: Buffer): Buffer {
    const nativeDecompress = (zlib as ZstdBindings).zstdDecompressSync;
    return nativeDecompress === undefined ? decodeRawZstdFrame(buffer) : nativeDecompress(buffer);
}

export function encodeRawZstdFrame(buffer: Buffer): Buffer {
    const header = Buffer.alloc(13);
    header.writeUInt32LE(ZSTD_MAGIC, 0);
    // Single segment + eight-byte frame content size. The latter keeps the framing simple for
    // every supported Buffer length and lets external zstd readers validate the complete frame.
    header[4] = 0xe0;
    header.writeBigUInt64LE(BigInt(buffer.length), 5);

    const blocks: Buffer[] = [header];
    let offset = 0;
    do {
        const size = Math.min(MAX_RAW_BLOCK_SIZE, buffer.length - offset);
        const isLast = offset + size === buffer.length;
        const blockHeader = Buffer.alloc(3);
        blockHeader.writeUIntLE((size << 3) | (isLast ? 1 : 0), 0, 3);
        blocks.push(blockHeader, buffer.subarray(offset, offset + size));
        offset += size;
        if (isLast) break;
    } while (offset < buffer.length);
    return Buffer.concat(blocks);
}

function decodeRawZstdFrame(buffer: Buffer): Buffer {
    if (buffer.length < 13 || buffer.readUInt32LE(0) !== ZSTD_MAGIC || buffer[4] !== 0xe0) {
        throw new Error("This Node runtime can only read raw-block Zstandard frames written by POKIE; use Node 22.15+ for compressed Zstandard input.");
    }

    const expectedSize = buffer.readBigUInt64LE(5);
    if (expectedSize > BigInt(buffer.length)) {
        throw new Error("Zstandard frame declares more content than its raw blocks can contain.");
    }

    let offset = 13;
    const blocks: Buffer[] = [];
    let outputSize = 0;
    let isLast = false;
    while (!isLast) {
        if (offset + 3 > buffer.length) throw new Error("Zstandard frame ended before its final block.");
        const blockHeader = buffer.readUIntLE(offset, 3);
        offset += 3;
        isLast = (blockHeader & 1) === 1;
        const blockType = (blockHeader >> 1) & 0b11;
        const blockSize = blockHeader >> 3;
        if (blockType !== 0 || offset + blockSize > buffer.length) {
            throw new Error("This Node runtime can only read raw-block Zstandard frames written by POKIE; use Node 22.15+ for compressed Zstandard input.");
        }
        blocks.push(buffer.subarray(offset, offset + blockSize));
        outputSize += blockSize;
        offset += blockSize;
    }

    if (offset !== buffer.length || BigInt(outputSize) !== expectedSize) {
        throw new Error("Zstandard frame content size does not match its raw blocks.");
    }
    return Buffer.concat(blocks, outputSize);
}

/** ExcelJS creates ordinary ZIP containers with wall-clock entry timestamps.
 * Normalize only those header timestamps so a reviewed workbook candidate can
 * be reproduced in another CLI process. XML content and CRCs stay untouched.
 */
export function stabilizeWorkbookContainer(input: ArrayBuffer | Uint8Array): Buffer {
    const bytes = Buffer.from(input instanceof Uint8Array ? input : new Uint8Array(input));
    let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
    if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50) throw new Error("Invalid generated workbook ZIP directory.");
    const count = bytes.readUInt16LE(end + 10);
    let offset = bytes.readUInt32LE(end + 16);
    for (let index = 0; index < count; index++) {
        if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("Unsupported generated workbook ZIP directory.");
        const local = bytes.readUInt32LE(offset + 42);
        if (local + 30 > offset || bytes.readUInt32LE(local) !== 0x04034b50) throw new Error("Unsupported generated workbook ZIP member.");
        // DOS time 00:00:00 and date 1980-01-01, valid on every ZIP reader.
        bytes.writeUInt16LE(0, local + 10);
        bytes.writeUInt16LE(33, local + 12);
        bytes.writeUInt16LE(0, offset + 12);
        bytes.writeUInt16LE(33, offset + 14);
        offset += 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    }
    if (offset !== end) throw new Error("Unsupported generated workbook ZIP layout.");
    return bytes;
}

/** A real uncompressed, calibrated grayscale TIFF, small enough for host tests. */
export function calibratedTiff({
  little = true,
  big = false,
  description = 'ImageJ=1.54\nunit=um\n',
  denominator = 1
} = {}): Buffer {
  const offsetSize = big ? 8 : 4,
    entrySize = big ? 20 : 12,
    headerSize = big ? 16 : 8;
  const uint = (value: number, size: number) => {
    const data = Buffer.alloc(size);
    if (size === 8)
      little
        ? data.writeBigUInt64LE(BigInt(value))
        : data.writeBigUInt64BE(BigInt(value));
    else
      little
        ? data.writeUIntLE(value, 0, size)
        : data.writeUIntBE(value, 0, size);
    return data;
  };
  const rational = Buffer.concat([uint(2, 4), uint(denominator, 4)]);
  const fields: [number, number, number, Buffer][] = [
    [256, 4, 1, uint(32, 4)],
    [257, 4, 1, uint(16, 4)],
    [258, 3, 1, uint(8, 2)],
    [259, 3, 1, uint(1, 2)],
    [262, 3, 1, uint(1, 2)],
    [
      270,
      2,
      Buffer.byteLength(description) + 1,
      Buffer.from(description + '\0')
    ],
    [273, 4, 1, uint(0, 4)],
    [277, 3, 1, uint(1, 2)],
    [278, 4, 1, uint(16, 4)],
    [279, 4, 1, uint(512, 4)],
    [282, 5, 1, rational],
    [283, 5, 1, rational],
    [296, 3, 1, uint(1, 2)]
  ];
  const countSize = big ? 8 : 2;
  let next = headerSize + countSize + fields.length * entrySize + offsetSize;
  const entries: Buffer[] = [],
    payloads: Buffer[] = [];
  for (const [tag, type, count, data] of fields) {
    const entry = Buffer.alloc(entrySize);
    uint(tag, 2).copy(entry);
    uint(type, 2).copy(entry, 2);
    uint(count, big ? 8 : 4).copy(entry, 4);
    if (data.length <= offsetSize) data.copy(entry, big ? 12 : 8);
    else {
      uint(next, offsetSize).copy(entry, big ? 12 : 8);
      payloads.push(data);
      next += data.length;
    }
    entries.push(entry);
  }
  uint(next, 4).copy(entries[6], big ? 12 : 8);
  const header = Buffer.concat([
    Buffer.from(little ? 'II' : 'MM'),
    uint(big ? 43 : 42, 2),
    ...(big ? [uint(8, 2), uint(0, 2)] : []),
    uint(headerSize, offsetSize)
  ]);
  const pixels = Buffer.from(Array.from({ length: 512 }, (_, i) => i % 256));
  return Buffer.concat([
    header,
    uint(fields.length, countSize),
    ...entries,
    uint(0, offsetSize),
    ...payloads,
    pixels
  ]);
}

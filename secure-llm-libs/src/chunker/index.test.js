// chunker.test.js
const { chunkJson, reconstructJson } = require('./');
const MAX_SIZE = 1024 * 1024;

function createLargeArrayOver1MB() {
  const arr = [];
  let size = 2;

  while (size <= MAX_SIZE + 10000) {
    const item = { secret: 'AKIA' + 'x'.repeat(1000) };
    arr.push(item);
    size = Buffer.byteLength(JSON.stringify(arr), 'utf8');
  }

  return arr;
}

function createLargeObjectOver1MB() {
  const obj = {};
  let size = 2;
  let i = 0;

  while (size <= MAX_SIZE + 10000) {
    const key = `key${i}`;
    const value = 'AKIA' + 'x'.repeat(2048);
    obj[key] = value;
    size = Buffer.byteLength(JSON.stringify(obj), 'utf8');
    i++;
  }

  return obj;
}

describe('chunkJson + reconstructJson', () => {
  test('reconstructs large array', () => {
    const input = createLargeArrayOver1MB();
    const jsonStr = JSON.stringify(input);
    const chunks = chunkJson(jsonStr);
    expect(chunks.length).toBeGreaterThan(1);

    chunks.forEach(c => {
      expect(Buffer.byteLength(c.chunk, 'utf8')).toBeLessThanOrEqual(MAX_SIZE);
    });

    const reconstructed = reconstructJson(chunks);
    expect(reconstructed).toEqual(input);
  });

  test('reconstructs large object', () => {
    const input = createLargeObjectOver1MB();
    const jsonStr = JSON.stringify(input);
    const chunks = chunkJson(jsonStr);
    expect(chunks.length).toBeGreaterThan(1);

    chunks.forEach(c => {
      expect(Buffer.byteLength(c.chunk, 'utf8')).toBeLessThanOrEqual(MAX_SIZE);
    });

    const reconstructed = reconstructJson(chunks);
    expect(reconstructed).toEqual(input);
  });

  test('throws on unsupported primitive types', () => {
    const primitives = ['"string"', '42', 'true', 'null'];
    for (const val of primitives) {
      expect(() => {
        chunkJson(val);
      }).toThrow(/Unsupported JSON root type/);
    }
  });

  test('handles small array as one chunk', () => {
    const input = [{ a: 1 }, { b: 2 }];
    const chunks = chunkJson(JSON.stringify(input));
    expect(chunks.length).toBe(1);
    expect(reconstructJson(chunks)).toEqual(input);
  });

  test('includes index and total', () => {
    const input = createLargeArrayOver1MB();
    const chunks = chunkJson(JSON.stringify(input));
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.total).toBe(chunks.length);
    });
  });
});


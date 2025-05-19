// chunker.js
const MAX_CHUNK_SIZE = 1024 * 1024; // 1 MB

/**
 * Split a JSON string into ≤ 1 MB chunks, keeping keys/values intact.
 * Throws if the root is not an object or array.
 * Returns an array of { index, total, chunk }.
 */
function chunkJson(jsonString) {
  const parsed = JSON.parse(jsonString);

  if (!Array.isArray(parsed) && (typeof parsed !== 'object' || parsed === null)) {
    throw new Error('Unsupported JSON root type. Must be an object or array.');
  }

  // If already under the limit, short-circuit
  if (Buffer.byteLength(jsonString, 'utf8') <= MAX_CHUNK_SIZE) {
    return [{ index: 0, total: 1, chunk: jsonString }];
  }

  const rawChunks = Array.isArray(parsed)
    ? chunkArray(parsed)
    : chunkObject(parsed);

  return rawChunks.map((chunk, i) => ({
    index: i,
    total: rawChunks.length,
    chunk,
  }));
}

/* ───────── helpers ───────── */

function chunkArray(arr) {
  const chunks = [];
  let current = [];
  let currentSize = 2; // opening + closing brackets: []

  for (const item of arr) {
    const itemStr  = JSON.stringify(item);
    const itemSize = Buffer.byteLength(itemStr, 'utf8') + (current.length ? 1 : 0); // + comma if not first

    if (currentSize + itemSize > MAX_CHUNK_SIZE) {
      chunks.push(JSON.stringify(current));
      current      = [item];
      currentSize  = 2 + Buffer.byteLength(itemStr, 'utf8'); // braces + first element
    } else {
      current.push(item);
      currentSize += itemSize;
    }
  }

  if (current.length) chunks.push(JSON.stringify(current));
  return chunks;
}

function chunkObject(obj) {
  const chunks = [];
  let current = {};
  let currentSize = 2; // {}

  for (const [key, value] of Object.entries(obj)) {
    const entry     = `"${key}":${JSON.stringify(value)}`;
    const entrySize = Buffer.byteLength(entry, 'utf8') + (Object.keys(current).length ? 1 : 0); // + comma

    if (currentSize + entrySize > MAX_CHUNK_SIZE) {
      chunks.push(JSON.stringify(current));
      current      = {};
      currentSize  = 2;
    }

    current[key] = value;
    currentSize += entrySize;
  }

  if (Object.keys(current).length) chunks.push(JSON.stringify(current));
  return chunks;
}

function reconstructJson(chunks) {
  const ordered = [...chunks]
    .sort((a, b) => a.index - b.index)
    .map(c => JSON.parse(c.chunk));

  if (Array.isArray(ordered[0])) {
    return ordered.flat();
  }
  if (typeof ordered[0] === 'object' && ordered[0] !== null) {
    return Object.assign({}, ...ordered);
  }
  throw new Error('Unsupported chunk content');
}

module.exports = { chunkJson, reconstructJson };


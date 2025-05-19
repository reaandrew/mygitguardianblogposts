#!/usr/bin/env node
/**
 * GitGuardian multiscan CLI
 *
 *   node gitguardian-wrapper.js scan <file.json>
 *
 * ENV:
 *   GITGUARDIAN_API_KEY
 */

const fs   = require('fs');
const path = require('path');
const { chunkJson } = require('../chunker');

/* ---------- fetch helper (works on every Node) ---------- */

let fetchFn;
if (typeof fetch === 'function') {
  fetchFn = fetch;                                   // Node 18+
} else {
  fetchFn = (...a) => import('node-fetch').then(m => m.default(...a));
}

/* ---------- constants ---------- */

const MAX_MB          = 1;
const MAX_DOC_SIZE    = MAX_MB * 1024 * 1024;
const MAX_DOCS        = 20;
const GG_ENDPOINT     = 'https://api.gitguardian.com/v1/multiscan';
const API_KEY         = process.env.GITGUARDIAN_API_KEY;

if (!API_KEY) {
  console.error('❌  Set GITGUARDIAN_API_KEY in your environment');
  process.exit(1);
}

/* ---------- helpers ---------- */

async function gitguardianMultiscan(docs) {
  const resp = await fetchFn(GG_ENDPOINT, {
    method  : 'POST',
    headers : {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(docs),          // <-- ARRAY, not {documents: …}
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => resp.statusText);
    throw new Error(`GitGuardian API error ${resp.status}: ${txt}`);
  }
  return resp.json();
}

function buildDocuments(raw, filename) {
  if (Buffer.byteLength(raw, 'utf8') <= MAX_DOC_SIZE) {
    return [{ filename, document: raw }];
  }

  const chunks = chunkJson(raw).map(c => c.chunk);
  if (chunks.length > MAX_DOCS) {
    throw new Error(`File would need ${chunks.length} chunks (>${MAX_DOCS}); aborting.`);
  }

  return chunks.map((doc, i) => ({
    filename: `${filename}.part${i}`,
    document: doc,
  }));
}

/* ---------- CLI ---------- */

async function main() {
  const [, , cmd, file] = process.argv;
  if (cmd !== 'scan' || !file) {
    console.log('Usage:\n  node gitguardian-wrapper.js scan <file.json>');
    process.exit(1);
  }

  const raw   = fs.readFileSync(file, 'utf8');
  const docs  = buildDocuments(raw, path.basename(file));

  console.log(`→ Sending ${docs.length} document(s)…`);

  try {
    const res = await gitguardianMultiscan(docs);
    console.log('\nGitGuardian response:\n');
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(`❌  ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { gitguardianMultiscan, buildDocuments };


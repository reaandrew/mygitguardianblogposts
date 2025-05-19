#!/usr/bin/env node
/**
 * Simple CLI for chunker.js
 *
 * Commands:
 *   1. split <input.json> [--outDir <dir>]
 *        → writes   <basename>.chunk0.json … N   (raw chunk strings)
 *
 *   2. reconstruct <output.json> <chunk1.json> <chunk2.json> …
 *        → merges all chunks in the order supplied and writes <output.json>
 *
 * No external dependencies – just Node's built-ins.
 */

const fs   = require('fs');
const path = require('path');
const { chunkJson, reconstructJson } = require('./');

const [, , cmd, ...rest] = process.argv;

/* ---------- helpers ---------- */

function exitWithUsage(code = 1) {
  console.log(`Usage:
  node cli.js split <input.json> [--outDir <dir>]

  node cli.js reconstruct <output.json> <chunk1.json> <chunk2.json> [...]
`);
  process.exit(code);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readChunks(files) {
  return files.map((file, i) => ({
    index : i,
    total : files.length,
    chunk : fs.readFileSync(file, 'utf8'),
  }));
}

/* ---------- command: split ---------- */

function cmdSplit(args) {
  const [input] = args;
  if (!input) exitWithUsage();

  const outDirFlag = args.indexOf('--outDir');
  const outDir     = outDirFlag !== -1 ? args[outDirFlag + 1] : path.dirname(input);
  ensureDir(outDir);

  const json  = fs.readFileSync(input, 'utf8');
  const parts = chunkJson(json);
  const base  = path.basename(input, path.extname(input));

  parts.forEach(({ chunk }, i) => {
    const outFile = path.join(outDir, `${base}.chunk${i}.json`);
    fs.writeFileSync(outFile, chunk);
    console.log('✓ wrote', outFile);
  });

  console.log(`\n🚀  Split complete – ${parts.length} chunk(s) created in "${outDir}"`);
}

/* ---------- command: reconstruct ---------- */

function cmdReconstruct(args) {
  const [output, ...chunkFiles] = args;
  if (!output || chunkFiles.length === 0) exitWithUsage();

  const wrapped   = readChunks(chunkFiles);
  const combined  = reconstructJson(wrapped);
  fs.writeFileSync(output, JSON.stringify(combined, null, 2));

  console.log(`\n🔗  Reconstruction complete – wrote "${output}"`);
}

/* ---------- main ---------- */

switch (cmd) {
  case 'split':        cmdSplit(rest);        break;
  case 'reconstruct':  cmdReconstruct(rest);  break;
  default:             exitWithUsage();
}


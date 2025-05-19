#!/usr/bin/env node
/**
 * Stream-based JSON generator that embeds secrets matching GitGuardian detectors.
 *
 * Examples
 *   node generate-json.js --size 50  --out gg_50mb.json            # ~50 MB
 *   node generate-json.js --count 500000 --secretRate 0.05 --out sample.json
 *
 * Options
 *   --size <MB>       Target size in megabytes   (mutually exclusive with --count)
 *   --count <N>       Exact number of objects    (mutually exclusive with --size)
 *   --secretRate <f>  Fraction [0-1] of records containing ONE secret (default 0.03)
 *   --out <file>      Output filename (default output.json)
 */

const fs        = require('fs');
const minimist  = require('minimist');
const { faker } = require('@faker-js/faker');

/* ---------- CLI args ---------- */

const argv = minimist(process.argv.slice(2), {
  alias  : { s: 'size', c: 'count', r: 'secretRate', o: 'out' },
  default: { out: 'output.json', secretRate: 0.03 },
});

const TARGET_MB    = Number(argv.size);
const TARGET_COUNT = Number(argv.count);
const SECRET_RATE  = Number(argv.secretRate);
const OUT_FILE     = argv.out;

if ((!TARGET_MB && !TARGET_COUNT) || (TARGET_MB && TARGET_COUNT)) {
  console.error('\nProvide either --size <MB> OR --count <N>\n');
  process.exit(1);
}
if (SECRET_RATE < 0 || SECRET_RATE > 1) {
  console.error('\n--secretRate must be between 0 and 1\n');
  process.exit(1);
}

const TARGET_BYTES = TARGET_MB ? TARGET_MB * 1024 * 1024 : null;

/* ---------- Sample secrets (taken from GitGuardian docs) ---------- */

const SECRETS = [
  // AWS key pair
  { field: 'AWS_ACCESS_KEY_ID',      value: 'AKIAIOSFODNN7EXAMPLE' },
  { field: 'AWS_SECRET_ACCESS_KEY',  value: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },

  // MongoDB URI
  { field: 'MONGO_URI',              value: 'mongodb+srv://user:password@cluster0.example.mongodb.net/test?retryWrites=true&w=majority' },

  // Slack webhook
  { field: 'SLACK_WEBHOOK',          value: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX' },

  // Stripe secret key
  { field: 'STRIPE_SK',              value: 'sk_live_4eC39HqLyjWDarjtT1zdp7dc' },

  // GitHub personal access token
  { field: 'GITHUB_PAT',             value: 'ghp_0123456789abcdefghijklmnopqrstuvwxyzABCDE' },

  // Twilio auth token
  { field: 'TWILIO_AUTH_TOKEN',      value: '1234567890abcdef1234567890abcdef' },
];

/* ---------- Streaming generator ---------- */

const stream       = fs.createWriteStream(OUT_FILE);
let bytesWritten   = 0;
let objectsWritten = 0;

stream.write('[\n');
bytesWritten += 2; // "[\n"

function randomRecord() {
  return {
    id      : faker.string.uuid(),
    name    : faker.person.fullName(),
    email   : faker.internet.email(),
    company : faker.company.name(),
    address : faker.location.streetAddress({ useFullAddress: true }),
    lorem   : faker.lorem.paragraph(),
  };
}

function maybeAddSecret(obj) {
  if (Math.random() > SECRET_RATE) return obj;
  const secret = SECRETS[Math.floor(Math.random() * SECRETS.length)];
  return { ...obj, [secret.field]: secret.value };
}

function stopCondition() {
  if (TARGET_COUNT) return objectsWritten >= TARGET_COUNT;
  return bytesWritten >= TARGET_BYTES;
}

function writeNext() {
  if (stopCondition()) return finish();

  const record  = maybeAddSecret(randomRecord());
  let   payload = JSON.stringify(record);

  if (objectsWritten > 0) payload = ',\n' + payload;

  if (!stream.write(payload)) {
    stream.once('drain', writeNext);
    return;
  }

  bytesWritten   += Buffer.byteLength(payload, 'utf8');
  objectsWritten += 1;

  if (objectsWritten % 10000 === 0) {
    process.stdout.write(`\r… ${objectsWritten.toLocaleString()} records, ${(bytesWritten / 1048576).toFixed(1)} MB`);
  }
  setImmediate(writeNext);
}

function finish() {
  stream.end('\n]\n', () => {
    console.log(
      `\n✅  Generated ${objectsWritten.toLocaleString()} records ` +
      `(${(bytesWritten / 1048576).toFixed(1)} MB) → ${OUT_FILE}`
    );
  });
}

writeNext();


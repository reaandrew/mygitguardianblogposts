/**
 * GitGuardian wrapper library for scanning and redacting sensitive content
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

/* ---------- helpers ---------- */

/**
 * Scans content using GitGuardian API
 * @param {string|Array} contentOrDocs - Content to scan or pre-built document array
 * @param {string} apiKey - GitGuardian API key
 * @param {string} [filename] - Filename to use (if content is provided)
 * @returns {Promise<Array>} Scan results
 */
async function gitguardianMultiscan(contentOrDocs, apiKey, filename = "document.txt") {
  if (!apiKey) {
    throw new Error('GitGuardian API key is required');
  }
  
  // Determine if we received raw content or pre-built docs
  let docs;
  if (typeof contentOrDocs === 'string') {
    // Build documents from raw content
    docs = buildDocuments(contentOrDocs, filename);
  } else if (Array.isArray(contentOrDocs)) {
    // Use the provided documents directly
    docs = contentOrDocs;
  } else {
    throw new Error('contentOrDocs must be a string or an array of documents');
  }

  // Make the API call
  const resp = await fetchFn(GG_ENDPOINT, {
    method  : 'POST',
    headers : {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${apiKey}`,
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

/**
 * Redacts sensitive content based on GitGuardian scan results
 * @param {string} content - The content to redact
 * @param {Object} scanResult - The GitGuardian scan result
 * @returns {Object} Object containing redacted content and redaction info
 */
function redactSensitiveContent(content, scanResult) {
  if (!scanResult.policy_breaks || scanResult.policy_breaks.length === 0) {
    return {
      content,
      redactions: []
    };
  }

  let redactedContent = content;
  const redactions = [];
  const processedRanges = new Set();

  // Sort matches by start position in reverse order to avoid position shifts
  const allMatches = scanResult.policy_breaks.flatMap(policyBreak => {
    // Handle different match structures
    if (policyBreak.matches) {
      return policyBreak.matches.map(match => ({
        ...match,
        type: policyBreak.type,
        start: match.index_start || match.start,
        end: (match.index_end || match.end) + 1, // Add 1 to include the last character
        policy: policyBreak.policy
      }));
    }
    return [];
  }).sort((a, b) => b.start - a.start);

  // Apply redactions
  for (const match of allMatches) {
    if (match.start === undefined || match.end === undefined) {
      continue; // Skip matches without position information
    }

    // Create a unique key for this range
    const rangeKey = `${match.start}-${match.end}`;
    if (processedRanges.has(rangeKey)) {
      continue; // Skip if we've already processed this range
    }
    processedRanges.add(rangeKey);

    const before = redactedContent.substring(0, match.start);
    const after = redactedContent.substring(match.end);
    redactedContent = before + 'REDACTED' + after;

    redactions.push({
      type: match.type,
      start: match.start,
      end: match.end,
      original: content.substring(match.start, match.end),
      policy: match.policy
    });
  }

  return {
    content: redactedContent,
    redactions
  };
}


/**
 * Scans content for sensitive information with optional redaction
 * @param {string} content - Content to scan
 * @param {string} apiKey - GitGuardian API key
 * @param {Object} [options] - Scan options
 * @param {string} [options.filename="document.txt"] - Filename to use for the scan
 * @param {boolean} [options.redact=true] - Whether to redact sensitive content
 * @returns {Promise<Object>} Object with scan results and optional redaction info
 */
async function scan(content, apiKey, options = {}) {
  const { 
    filename = "document.txt", 
    redact = true 
  } = options;
  
  try {
    // Scan the content
    const results = await gitguardianMultiscan(content, apiKey, filename);
    
    // Process scan results
    let scanResult;
    if (results.length === 1) {
      scanResult = results[0];
    } else {
      // Combine policy breaks from all chunks
      scanResult = {
        policy_breaks: []
      };
      
      for (const result of results) {
        if (result.policy_breaks && result.policy_breaks.length > 0) {
          scanResult.policy_breaks.push(...result.policy_breaks);
        }
      }
    }
    
    // Apply redactions if requested
    if (redact) {
      return redactSensitiveContent(content, scanResult);
    } else {
      // Return scan result without redaction
      return {
        content,
        redactions: [],
        scan_result: scanResult
      };
    }
  } catch (error) {
    console.error('GitGuardian scan failed:', error.message);
    // Return original content if scanning fails
    return {
      content,
      redactions: [],
      error: error.message
    };
  }
}

module.exports = { gitguardianMultiscan, buildDocuments, redactSensitiveContent, scan };


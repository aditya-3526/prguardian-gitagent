'use strict';

/**
 * Secret Detector
 * 
 * Regex-based secret/credential detection.
 * Patterns sourced from knowledge/risk_patterns.md.
 * Only scans ADDED lines — removing a secret is not a leak.
 */

const SECRET_PATTERNS = [
  {
    type: 'AWS Access Key',
    regex: /AKIA[A-Z0-9]{16}/g,
    confidence: 'CONFIRMED'
  },
  {
    type: 'Stripe Live Key',
    regex: /sk_live_[a-zA-Z0-9]{24,}/g,
    confidence: 'CONFIRMED'
  },
  {
    type: 'Stripe Test Key',
    regex: /sk_test_[a-zA-Z0-9]{24,}/g,
    confidence: 'HIGH CONFIDENCE'
  },
  {
    type: 'GitHub Personal Access Token',
    regex: /ghp_[a-zA-Z0-9]{36}/g,
    confidence: 'CONFIRMED'
  },
  {
    type: 'RSA Private Key',
    regex: /-----BEGIN RSA PRIVATE KEY-----/g,
    confidence: 'CONFIRMED'
  },
  {
    type: 'EC Private Key',
    regex: /-----BEGIN EC PRIVATE KEY-----/g,
    confidence: 'CONFIRMED'
  },
  {
    type: 'MongoDB Connection URI',
    regex: /mongodb(\+srv)?:\/\/[^\s/]+:[^\s/]+@/g,
    confidence: 'CONFIRMED'
  },
  {
    type: 'PostgreSQL Connection URI',
    regex: /postgres(ql)?:\/\/[^\s/]+:[^\s/]+@/g,
    confidence: 'CONFIRMED'
  },
  {
    type: 'MySQL Connection URI',
    regex: /mysql:\/\/[^\s/]+:[^\s/]+@/g,
    confidence: 'CONFIRMED'
  },
  {
    type: 'Slack Token',
    regex: /xox[bpsa]-[a-zA-Z0-9-]+/g,
    confidence: 'HIGH CONFIDENCE'
  },
  {
    type: 'SendGrid API Key',
    regex: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g,
    confidence: 'CONFIRMED'
  },
  {
    type: 'Google API Key',
    regex: /AIza[0-9A-Za-z_-]{35}/g,
    confidence: 'CONFIRMED'
  },
  {
    type: 'Generic Bearer Token',
    regex: /Bearer\s+[a-zA-Z0-9\-._~+/]{40,}={0,2}/g,
    confidence: 'POSSIBLE'
  },
  {
    type: 'Hardcoded Secret Assignment',
    regex: /(?:api_key|apiKey|API_KEY|secret|SECRET|password|PASSWORD|token|TOKEN|credential|CREDENTIAL|private_key|privateKey|PRIVATE_KEY)\s*[:=]\s*['"]/g,
    confidence: 'POSSIBLE'
  }
];

// False positive indicators — checked against the MATCHED SECRET VALUE only
// (not the entire line, to avoid filtering real secrets on lines that happen
// to contain words like "example" in hostnames or "test" in variable names)
const VALUE_FALSE_POSITIVE_PATTERNS = [
  /^[x]{4,}$/i,                        // xxxx, XXXX
  /placeholder/i,                       // placeholder values
  /^your[_-]/i,                         // YOUR_KEY_HERE, your-key
  /changeme/i,                          // changeme
  /^dummy/i,                            // dummy values
  /REDACTED/i,                          // REDACTED values
  /INSERT[_-]?HERE/i,                   // INSERT_HERE
  /^todo/i,                             // TODO
  /^fixme/i,                            // FIXME
  /^replace[_-]?me/i,                   // REPLACE_ME
  /^fake[_-]/i,                         // fake_key, fake-token
  /^sample[_-]/i,                       // sample_key
  /EXAMPLE/i,                           // AWS/Stripe doc example keys
];

// Line-level false positive checks — patterns that indicate the value
// comes from a safe source (env var, config lookup, etc.)
const LINE_SAFE_PATTERNS = [
  /process\.env\b/,                     // process.env.KEY
  /os\.environ/,                        // os.environ['KEY']
  /getenv\s*\(/,                        // getenv('KEY')
  /System\.getenv/,                     // Java System.getenv
  /ENV\[/,                              // Ruby ENV['KEY']
  /\$\{[A-Z_]+\}/,                     // ${ENV_VAR} interpolation
];

/**
 * Scan parsed diff for secrets.
 * Only scans added_lines from each file.
 * 
 * @param {Object} parsedDiff - Output from diff-parser.js
 * @returns {Object} { secrets_detected: number, findings: Array }
 */
function scan(parsedDiff) {
  const findings = [];

  if (!parsedDiff || !parsedDiff.files) {
    return { secrets_detected: 0, findings: [] };
  }

  for (const file of parsedDiff.files) {
    if (!file.added_lines) continue;

    for (let lineIdx = 0; lineIdx < file.added_lines.length; lineIdx++) {
      const line = file.added_lines[lineIdx];

      for (const pattern of SECRET_PATTERNS) {
        // Reset regex lastIndex for global patterns
        pattern.regex.lastIndex = 0;
        const match = pattern.regex.exec(line);

        if (match) {
          // Check for false positives
          if (isFalsePositive(line, match[0])) continue;

          // Redact the matched content for safe output
          const redacted = redactMatch(match[0]);

          findings.push({
            type: pattern.type,
            pattern: pattern.regex.source,
            file: file.path,
            line: lineIdx + 1,
            confidence: pattern.confidence,
            matched_content: redacted,
            raw_line_preview: truncateLine(line, 120)
          });
        }
      }
    }
  }

  return {
    secrets_detected: findings.length,
    findings: findings
  };
}

/**
 * Check if a match is likely a false positive.
 * 
 * Strategy:
 *   1. Check if the MATCHED VALUE itself looks like a placeholder
 *   2. Check if the LINE indicates the value comes from a safe source (env var)
 */
function isFalsePositive(line, matchedText) {
  // Check the matched value against placeholder patterns
  for (const pattern of VALUE_FALSE_POSITIVE_PATTERNS) {
    if (pattern.test(matchedText)) {
      return true;
    }
  }

  // Check if the line indicates the value comes from a safe source
  for (const pattern of LINE_SAFE_PATTERNS) {
    if (pattern.test(line)) {
      return true;
    }
  }

  return false;
}

/**
 * Redact a matched secret for safe output.
 * Shows first 8 chars and last 4, masks the rest.
 */
function redactMatch(text) {
  if (text.length <= 12) {
    return text.substring(0, 4) + '****';
  }
  return text.substring(0, 8) + '****' + text.substring(text.length - 4);
}

/**
 * Truncate a line for preview, avoiding exposing full secrets.
 */
function truncateLine(line, maxLen) {
  if (line.length <= maxLen) return line;
  return line.substring(0, maxLen) + '...';
}

module.exports = { scan, SECRET_PATTERNS };

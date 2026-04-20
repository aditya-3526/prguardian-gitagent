'use strict';

/**
 * Sensitive File Detector
 * 
 * Classifies changed files by risk category based on path patterns.
 * Categories and risk factors sourced from knowledge/risk_patterns.md.
 */

const RISK_CATEGORIES = {
  CRITICAL: {
    risk_factor: 25,
    patterns: [
      { regex: /(?:^|\/)auth\//i, module: 'Authentication' },
      { regex: /(?:^|\/)authentication\//i, module: 'Authentication' },
      { regex: /(?:^|\/)authorization\//i, module: 'Authorization' },
      { regex: /(?:^|\/)session\//i, module: 'Session Management' },
      { regex: /(?:^|\/)payments?\//i, module: 'Payment Processing' },
      { regex: /(?:^|\/)billing\//i, module: 'Billing' },
      { regex: /(?:^|\/)checkout\//i, module: 'Checkout Flow' },
      { regex: /(?:^|\/)crypto\//i, module: 'Cryptography' },
      { regex: /(?:^|\/)encryption\//i, module: 'Cryptography' }
    ]
  },
  HIGH: {
    risk_factor: 15,
    patterns: [
      { regex: /(?:^|\/)middleware\//i, module: 'Middleware' },
      { regex: /(?:^|\/)shared\//i, module: 'Shared Code' },
      { regex: /(?:^|\/)common\//i, module: 'Common Code' },
      { regex: /(?:^|\/)core\//i, module: 'Core' },
      { regex: /(?:^|\/)lib\//i, module: 'Library' },
      { regex: /(?:^|\/)utils?\//i, module: 'Utilities' },
      { regex: /(?:^|\/)migrations?\//i, module: 'Database Migrations' },
      { regex: /(?:^|\/)schema\//i, module: 'Data Schema' },
      { regex: /(?:^|\/)config\//i, module: 'Configuration' },
      { regex: /\.env(\.|$)/i, module: 'Environment Config' },
      { regex: /(?:^|\/)api\//i, module: 'API Layer' },
      { regex: /(?:^|\/)routes?\//i, module: 'API Routes' },
      { regex: /(?:^|\/)endpoints?\//i, module: 'API Endpoints' },
      { regex: /(?:^|\/)controllers?\//i, module: 'Controllers' }
    ]
  },
  MODERATE: {
    risk_factor: 5,
    patterns: [
      { regex: /(?:^|\/)services?\//i, module: 'Business Logic' },
      { regex: /(?:^|\/)models?\//i, module: 'Data Models' },
      { regex: /(?:^|\/)entities\//i, module: 'Entities' },
      { regex: /(?:^|\/)hooks?\//i, module: 'Lifecycle Hooks' },
      { regex: /(?:^|\/)workers?\//i, module: 'Background Workers' },
      { regex: /(?:^|\/)jobs?\//i, module: 'Background Jobs' },
      { regex: /(?:^|\/)cache\//i, module: 'Caching' },
      { regex: /(?:^|\/)queue\//i, module: 'Message Queue' }
    ]
  },
  LOW: {
    risk_factor: 0,
    patterns: [
      { regex: /(?:^|\/)tests?\//i, module: 'Tests' },
      { regex: /(?:^|\/)__tests__\//i, module: 'Tests' },
      { regex: /(?:^|\/)spec\//i, module: 'Test Specs' },
      { regex: /(?:^|\/)docs?\//i, module: 'Documentation' },
      { regex: /(?:^|\/)documentation\//i, module: 'Documentation' },
      { regex: /\.md$/i, module: 'Markdown' },
      { regex: /(?:^|\/)stories?\//i, module: 'UI Stories' },
      { regex: /(?:^|\/)storybook\//i, module: 'Storybook' },
      { regex: /CHANGELOG/i, module: 'Changelog' },
      { regex: /README/i, module: 'Readme' },
      { regex: /LICENSE/i, module: 'License' }
    ]
  }
};

/**
 * Classify files from a parsed diff by risk category.
 *
 * @param {Object} parsedDiff - Output from diff-parser.js
 * @returns {Object} { sensitive_file_count, total_risk_factor, files: Array }
 */
function classify(parsedDiff) {
  if (!parsedDiff || !parsedDiff.files) {
    return { sensitive_file_count: 0, total_risk_factor: 0, files: [] };
  }

  const classifiedFiles = [];

  for (const file of parsedDiff.files) {
    const classification = classifyFile(file.path);
    classifiedFiles.push(classification);
  }

  // Only count files above LOW risk
  const sensitiveFiles = classifiedFiles.filter(f => f.category !== 'LOW');
  const totalRiskFactor = sensitiveFiles.reduce((sum, f) => sum + f.risk_factor, 0);

  return {
    sensitive_file_count: sensitiveFiles.length,
    total_risk_factor: totalRiskFactor,
    files: classifiedFiles
  };
}

/**
 * Classify a single file path.
 */
function classifyFile(filePath) {
  const matchedPatterns = [];
  let highestCategory = 'LOW';
  let highestRiskFactor = 0;
  let primaryModule = 'General';

  for (const [category, config] of Object.entries(RISK_CATEGORIES)) {
    for (const pattern of config.patterns) {
      if (pattern.regex.test(filePath)) {
        matchedPatterns.push(pattern.module);
        if (config.risk_factor > highestRiskFactor) {
          highestRiskFactor = config.risk_factor;
          highestCategory = category;
          primaryModule = pattern.module;
        }
      }
    }
  }

  // Deduplicate matched patterns
  const uniquePatterns = [...new Set(matchedPatterns)];

  return {
    path: filePath,
    category: highestCategory,
    risk_factor: highestRiskFactor,
    module: primaryModule,
    matched_patterns: uniquePatterns,
    reason: buildReason(highestCategory, primaryModule, uniquePatterns)
  };
}

/**
 * Build a human-readable reason string.
 */
function buildReason(category, module, patterns) {
  if (category === 'LOW') {
    return `Low-risk file (${module})`;
  }
  const patternStr = patterns.length > 1 ? ` (matches: ${patterns.join(', ')})` : '';
  return `${category} risk — ${module}${patternStr}`;
}

module.exports = { classify, classifyFile, RISK_CATEGORIES };

'use strict';

/**
 * Diff Metrics
 * 
 * Computes quantitative metrics from a parsed diff.
 */

const path = require('path');

/**
 * Compute metrics from a parsed diff.
 *
 * @param {Object} parsedDiff - Output from diff-parser.js
 * @returns {Object} Structured metrics
 */
function compute(parsedDiff) {
  if (!parsedDiff || !parsedDiff.files) {
    return {
      total_additions: 0,
      total_deletions: 0,
      total_changes: 0,
      file_count: 0,
      file_types: {},
      change_size: 'SMALL',
      primary_language: 'unknown'
    };
  }

  const totalAdditions = parsedDiff.total_additions || 0;
  const totalDeletions = parsedDiff.total_deletions || 0;
  const totalChanges = totalAdditions + totalDeletions;
  const fileCount = parsedDiff.file_count || 0;

  // File type breakdown
  const fileTypes = {};
  for (const file of parsedDiff.files) {
    const ext = path.extname(file.path) || '(no ext)';
    fileTypes[ext] = (fileTypes[ext] || 0) + 1;
  }

  // Change size classification
  const changeSize = classifyChangeSize(totalChanges);

  // Primary language (most common extension)
  const primaryLanguage = determinePrimaryLanguage(fileTypes);

  return {
    total_additions: totalAdditions,
    total_deletions: totalDeletions,
    total_changes: totalChanges,
    file_count: fileCount,
    file_types: fileTypes,
    file_type_count: Object.keys(fileTypes).length,
    change_size: changeSize,
    primary_language: primaryLanguage
  };
}

/**
 * Classify total change count into a size category.
 */
function classifyChangeSize(totalChanges) {
  if (totalChanges <= 50) return 'SMALL';
  if (totalChanges <= 200) return 'MEDIUM';
  if (totalChanges <= 500) return 'LARGE';
  return 'VERY_LARGE';
}

/**
 * Map file extensions to languages.
 */
const EXTENSION_TO_LANGUAGE = {
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.swift': 'Swift',
  '.cs': 'C#',
  '.cpp': 'C++',
  '.c': 'C',
  '.php': 'PHP',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.json': 'JSON',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.html': 'HTML',
  '.md': 'Markdown',
  '.tf': 'Terraform',
  '.dockerfile': 'Docker'
};

/**
 * Determine primary language from file type counts.
 */
function determinePrimaryLanguage(fileTypes) {
  let maxCount = 0;
  let primaryExt = '';

  for (const [ext, count] of Object.entries(fileTypes)) {
    if (count > maxCount) {
      maxCount = count;
      primaryExt = ext;
    }
  }

  return EXTENSION_TO_LANGUAGE[primaryExt] || primaryExt || 'unknown';
}

module.exports = { compute, classifyChangeSize };

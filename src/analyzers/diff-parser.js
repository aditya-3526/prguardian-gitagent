'use strict';

/**
 * Minimal Unified Diff Parser
 * 
 * Parses a raw unified diff string into structured data.
 * Scope: file paths + addition/deletion counts + line content.
 * Does NOT handle: binary files, renames, encoding edge cases (v1).
 */

function parseDiff(rawDiff) {
  if (!rawDiff || typeof rawDiff !== 'string' || rawDiff.trim().length === 0) {
    return {
      error: 'INVALID_DIFF',
      file_count: 0,
      total_additions: 0,
      total_deletions: 0,
      files: []
    };
  }

  const files = [];
  let currentFile = null;

  const lines = rawDiff.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect file header: +++ b/path/to/file
    if (line.startsWith('+++ ')) {
      const path = line.replace('+++ ', '').replace(/^b\//, '').trim();
      if (path === '/dev/null') continue;

      // Determine status from the previous --- line
      let status = 'modified';
      if (i > 0 && lines[i - 1].startsWith('--- ')) {
        const oldPath = lines[i - 1].replace('--- ', '').replace(/^a\//, '').trim();
        if (oldPath === '/dev/null') {
          status = 'added';
        }
      }

      currentFile = {
        path: path,
        status: status,
        additions: 0,
        deletions: 0,
        added_lines: [],
        deleted_lines: []
      };
      files.push(currentFile);
      continue;
    }

    // Detect deleted file
    if (line.startsWith('--- ') && i + 1 < lines.length && lines[i + 1].startsWith('+++ /dev/null')) {
      const oldPath = line.replace('--- ', '').replace(/^a\//, '').trim();
      currentFile = {
        path: oldPath,
        status: 'deleted',
        additions: 0,
        deletions: 0,
        added_lines: [],
        deleted_lines: []
      };
      files.push(currentFile);
      i++; // skip the +++ /dev/null line
      continue;
    }

    // Skip non-content lines
    if (!currentFile) continue;
    if (line.startsWith('diff --git')) continue;
    if (line.startsWith('index ')) continue;
    if (line.startsWith('--- ')) continue;
    if (line.startsWith('@@ ')) continue;
    if (line.startsWith('\\')) continue; // "\ No newline at end of file"

    // Count additions
    if (line.startsWith('+')) {
      currentFile.additions++;
      currentFile.added_lines.push(line.substring(1));
      continue;
    }

    // Count deletions
    if (line.startsWith('-')) {
      currentFile.deletions++;
      currentFile.deleted_lines.push(line.substring(1));
      continue;
    }

    // Context lines (space prefix) — tracked but not counted
  }

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return {
    file_count: files.length,
    total_additions: totalAdditions,
    total_deletions: totalDeletions,
    files: files
  };
}

/**
 * Parse a JSON input file (like demo/sample_pr.json) and extract the diff.
 * Returns { rawDiff, prDescription, changedFiles, authorContext, repoContext }
 */
function parseInputFile(content) {
  try {
    const data = JSON.parse(content);
    return {
      rawDiff: data.pr_diff || '',
      prDescription: data.pr_description || '',
      changedFiles: data.changed_files || [],
      authorContext: data.author_context || null,
      repoContext: data.repo_context || null
    };
  } catch {
    // Not JSON — treat as raw diff
    return {
      rawDiff: content,
      prDescription: '',
      changedFiles: [],
      authorContext: null,
      repoContext: null
    };
  }
}

module.exports = { parseDiff, parseInputFile };

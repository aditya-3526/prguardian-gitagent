'use strict';

/**
 * GitHub PR Fetcher
 * 
 * Fetches PR diff, metadata, changed files, and author context
 * from the GitHub API using @octokit/rest.
 */

async function createOctokit() {
  const { Octokit } = await import('@octokit/rest');
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required for GitHub API access.');
  }
  return new Octokit({ auth: token });
}

/**
 * Parse a PR reference string.
 * Formats: "owner/repo#123" or "owner/repo/pull/123"
 *
 * @param {string} prRef
 * @returns {{ owner: string, repo: string, number: number }}
 */
function parsePRRef(prRef) {
  // Format: owner/repo#123
  let match = prRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (match) {
    return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
  }

  // Format: owner/repo/pull/123
  match = prRef.match(/^([^/]+)\/([^/]+)\/pull\/(\d+)$/);
  if (match) {
    return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
  }

  throw new Error(
    `Invalid PR reference: "${prRef}". Expected format: owner/repo#123 or owner/repo/pull/123`
  );
}

/**
 * Fetch a PR from GitHub and return structured input.
 *
 * @param {string} prRef - PR reference (owner/repo#123)
 * @returns {Object} Structured input matching agent.yaml schema
 */
async function fetchPR(prRef) {
  const { owner, repo, number } = parsePRRef(prRef);
  const octokit = await createOctokit();

  // Fetch PR metadata
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: number });

  // Fetch PR diff
  const { data: diff } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: number,
    mediaType: { format: 'diff' }
  });

  // Fetch changed files
  const { data: files } = await octokit.pulls.listFiles({ owner, repo, pull_number: number });
  const changedFiles = files.map(f => f.filename);

  // Build author context
  const authorContext = await buildAuthorContext(octokit, owner, repo, pr);

  // Build repo context
  const repoContext = buildRepoContext(changedFiles);

  return {
    rawDiff: diff,
    prDescription: `PR #${number} — ${pr.title}\n\n${pr.body || ''}`,
    changedFiles,
    authorContext,
    repoContext
  };
}

/**
 * Build author context from GitHub data.
 */
async function buildAuthorContext(octokit, owner, repo, pr) {
  try {
    // Count author's PRs in this repo
    const { data: authorPRs } = await octokit.search.issuesAndPullRequests({
      q: `repo:${owner}/${repo} type:pr author:${pr.user.login}`,
      per_page: 1
    });

    const prCount = authorPRs.total_count;
    const isNew = prCount <= 1;

    // Get submission time info
    const submittedAt = new Date(pr.created_at);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return {
      is_new_contributor: isNew,
      pr_count_in_repo: prCount,
      hours_since_last_pr: null, // Would require additional API calls
      submitted_at: pr.created_at,
      day_of_week: dayNames[submittedAt.getDay()],
      local_hour: submittedAt.getHours()
    };
  } catch {
    return null;
  }
}

/**
 * Build repo context from changed files.
 */
function buildRepoContext(changedFiles) {
  const paths = changedFiles.join(' ').toLowerCase();

  return {
    has_payments_module: /(?:payment|billing|checkout|stripe|paypal)/i.test(paths),
    has_auth_module: /(?:auth|session|login|oauth|jwt|token)/i.test(paths),
    primary_language: 'unknown' // Would require repo API call
  };
}

module.exports = { fetchPR, parsePRRef };

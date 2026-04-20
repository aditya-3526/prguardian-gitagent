'use strict';

/**
 * GitHub PR Comment Poster (Idempotent)
 * 
 * Posts or updates a PRGuardian merge brief as a PR comment.
 * Uses an HTML marker to find and update existing comments
 * instead of creating duplicates.
 */

const MARKER = '<!-- prguardian-merge-brief -->';

/**
 * Post or update a PRGuardian merge brief comment on a PR.
 *
 * @param {string} prRef - PR reference (owner/repo#123)
 * @param {string} body - Markdown body of the comment
 */
async function postOrUpdate(prRef, body) {
  const { Octokit } = await import('@octokit/rest');
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required.');
  }

  const octokit = new Octokit({ auth: token });
  const { owner, repo, number } = parsePRRef(prRef);

  const markedBody = `${MARKER}\n${body}`;

  // Search for existing PRGuardian comment
  const existing = await findExistingComment(octokit, owner, repo, number);

  if (existing) {
    // Update existing comment
    await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body: markedBody
    });
    console.log(`[PRGuardian] Updated existing comment (ID: ${existing.id}) on ${prRef}`);
  } else {
    // Create new comment
    const { data } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body: markedBody
    });
    console.log(`[PRGuardian] Created new comment (ID: ${data.id}) on ${prRef}`);
  }
}

/**
 * Find an existing PRGuardian comment on the PR.
 */
async function findExistingComment(octokit, owner, repo, number) {
  try {
    const { data: comments } = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: number,
      per_page: 100
    });

    return comments.find(c => c.body && c.body.includes(MARKER)) || null;
  } catch {
    return null;
  }
}

/**
 * Parse PR reference string.
 */
function parsePRRef(prRef) {
  let match = prRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (match) {
    return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
  }

  match = prRef.match(/^([^/]+)\/([^/]+)\/pull\/(\d+)$/);
  if (match) {
    return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
  }

  throw new Error(`Invalid PR reference: "${prRef}"`);
}

module.exports = { postOrUpdate, MARKER };

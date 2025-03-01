import { danger, warn, fail } from "danger"

import yarn from "danger-plugin-yarn"

// "Highlight package dependencies on Node projects"
const rfc1 = async () => {
  await yarn()
}

import spellcheck from "danger-plugin-spellcheck"
// "Keep our Markdown documents awesome",
const rfc2 = async () => {
  await spellcheck({ settings: "artsy/peril-settings@spellcheck.json" })
}

// "No PR is too small to warrant a paragraph or two of summary"
// https://github.com/artsy/peril-settings/issues/5
export const rfc5 = () => {
  const pr = danger.github.pr
  if (pr.body === null || pr.body.length === 0) {
    fail("Please add a description to your PR.")
  }
}

// "Hook commit contexts to GitHub PR/Issue labels"
// https://github.com/artsy/peril-settings/issues/7
export const rfc7 = async () => {
  const pr = danger.github.thisPR
  const commitLabels: string[] = danger.git.commits
    .map(c => c.message)
    .filter(m => m.startsWith("[") && m.includes("]"))
    .map(m => (m.match(/\[(.*)\]/) as any)[1]) // Guaranteed to match based on filter above.

  if (commitLabels.length > 0) {
    const api = danger.github.api
    const githubLabels = await api.issues.listLabelsForRepo({ owner: pr.owner, repo: pr.repo })
    const matchingLabels = githubLabels.data
      .map(l => l.name)
      .filter(l => commitLabels.find(cl => l === cl))
      .filter(l => !danger.github.issue.labels.find(label => label.name === l))

    if (matchingLabels.length > 0) {
      await api.issues.addLabels({ owner: pr.owner, repo: pr.repo, number: pr.number, labels: matchingLabels })
    }
  }
}

// Always ensure we assign someone, so that our Slackbot work correctly
// https://github.com/artsy/peril-settings/issues/13
export const rfc13 = async () => {
  const pr = danger.github.pr
  const isRenovate = pr.user.login.toLowerCase().includes("renovate")
  const wipPR = pr.title.includes("WIP ") || pr.title.includes("[WIP]")
  if (!isRenovate && !wipPR && pr.assignee === null) {
    // Validate they are in the org, before asking to assign
    try {
      await danger.github.api.orgs.checkMembership({ org: "artsy", username: danger.github.pr.user.login })
      warn("Please assign someone to merge this PR, and optionally include people who should review.")
    } catch (error) {
      // They couldn't assign someone if they tried.
      return console.log("Sender does not have permission to assign to this PR")
    }
  }
}

// Require changelog entries on PRs with code changes
// https://github.com/artsy/peril-settings/issues/16
export const rfc16 = async () => {
  const pr = danger.github.pr
  if (pr.body.includes("#trivial")) {
    console.log("Skipping changelog check because the PR is marked as trivial")
    return
  }

  const changelogs = ["CHANGELOG.md", "changelog.md", "CHANGELOG.yml"]
  const isOpen = danger.github.pr.state === "open"

  // Get all the files in the root folder of the repo
  // e.g. https://api.github.com/repos/artsy/eigen/git/trees/master

  const rootContentsAPI = await danger.github.api.git.getTree({
    owner: pr.base.user.login,
    repo: pr.base.repo.name,
    tree_sha: pr.base.sha,
  })

  const rootContents = rootContentsAPI.data

  // We have some auto-generated Changelogs
  const isAutoGenerated = rootContents.tree.find((file: { path: string }) => file.path == ".autorc")
  if (isAutoGenerated) {
    console.log("Changelog is auto generated, so skipping any Changelog warnings")
    return
  }

  const hasChangelog = rootContents.tree.find((file: { path: string }) => changelogs.includes(file.path))
  if (isOpen && hasChangelog) {
    const files = [...danger.git.modified_files, ...danger.git.created_files]

    const hasCodeChanges = files.find(file => !file.match(/(test|spec)/i))
    const hasChangelogChanges = files.find(file => changelogs.includes(file))

    if (hasCodeChanges && !hasChangelogChanges) {
      warn(
        "It looks like code was changed without adding anything to the Changelog.<br/>You can add #trivial in the PR body to skip the check."
      )
    }
  }
}

// Warn PR authors if they assign more than one person to a PR
// https://github.com/artsy/README/issues/177
export const rfc177 = () => {
  const pr = danger.github.pr
  if (pr.assignees && pr.assignees.length > 1) {
    warn("Please only assign one person to a PR")
  }
}

// The default run
export default async () => {
  rfc1()
  await rfc2()
  rfc5()
  await rfc7()
  await rfc13()
  await rfc16()
  await rfc177()
}

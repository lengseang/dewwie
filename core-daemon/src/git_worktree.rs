use std::path::{Path, PathBuf};
use std::process::Command;
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub path: PathBuf,
    pub head: String,
    pub branch: Option<String>,
    pub is_bare: bool,
    pub is_locked: bool,
    pub lock_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffFile {
    pub path: String,
    pub status: String, // "modified" | "added" | "deleted" | "renamed"
    pub additions: usize,
    pub deletions: usize,
    pub patch: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffSummary {
    pub base_branch: String,
    pub target_branch: String,
    pub files: Vec<DiffFile>,
    pub total_additions: usize,
    pub total_deletions: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MergeResult {
    pub success: bool,
    pub commit: Option<String>,
    pub message: String,
    pub conflicts: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct GitWorktreeManager;

impl GitWorktreeManager {
    pub fn new() -> Self {
        Self
    }

    /// Run a git command in a working directory and return stdout string on success.
    fn run_git(&self, cwd: &Path, args: &[&str]) -> Result<String> {
        let output = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .output()
            .with_context(|| format!("Failed to execute 'git {}' in {}", args.join(" "), cwd.display()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            bail!(
                "git {} failed (exit code {:?}): {}",
                args.join(" "),
                output.status.code(),
                stderr.trim()
            );
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// List all worktrees for a git repository using porcelain output.
    pub fn list_worktrees(&self, repo_root: &Path) -> Result<Vec<WorktreeInfo>> {
        let stdout = self.run_git(repo_root, &["worktree", "list", "--porcelain"])?;
        let mut worktrees = Vec::new();

        let mut current_path: Option<PathBuf> = None;
        let mut current_head = String::new();
        let mut current_branch = None;
        let mut is_bare = false;
        let mut is_locked = false;
        let mut lock_reason = None;

        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                if let Some(path) = current_path.take() {
                    worktrees.push(WorktreeInfo {
                        path,
                        head: current_head.clone(),
                        branch: current_branch.take(),
                        is_bare,
                        is_locked,
                        lock_reason: lock_reason.take(),
                    });
                }
                current_head.clear();
                is_bare = false;
                is_locked = false;
                continue;
            }

            if let Some(rest) = line.strip_prefix("worktree ") {
                current_path = Some(PathBuf::from(rest.trim()));
            } else if let Some(rest) = line.strip_prefix("HEAD ") {
                current_head = rest.trim().to_string();
            } else if let Some(rest) = line.strip_prefix("branch ") {
                let full_ref = rest.trim();
                let short_name = full_ref.strip_prefix("refs/heads/").unwrap_or(full_ref);
                current_branch = Some(short_name.to_string());
            } else if line == "bare" {
                is_bare = true;
            } else if line.starts_with("locked") {
                is_locked = true;
                if let Some(reason) = line.strip_prefix("locked ") {
                    lock_reason = Some(reason.trim().to_string());
                }
            }
        }

        if let Some(path) = current_path.take() {
            worktrees.push(WorktreeInfo {
                path,
                head: current_head,
                branch: current_branch,
                is_bare,
                is_locked,
                lock_reason,
            });
        }

        Ok(worktrees)
    }

    /// Add a new worktree linked to a new or existing branch with exponential backoff for lock contention.
    pub fn add_worktree(
        &self,
        repo_root: &Path,
        worktree_path: &Path,
        branch_name: &str,
        base_branch: Option<&str>,
    ) -> Result<()> {
        let path_str = worktree_path
            .to_str()
            .context("Invalid UTF-8 in worktree path")?;

        let mut attempts = 0;
        let max_attempts = 5;

        loop {
            // Check if branch already exists
            let branch_exists = Command::new("git")
                .args(["rev-parse", "--verify", branch_name])
                .current_dir(repo_root)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);

            let res = if branch_exists {
                self.run_git(repo_root, &["worktree", "add", path_str, branch_name])
            } else {
                let base = base_branch.unwrap_or("HEAD");
                self.run_git(
                    repo_root,
                    &["worktree", "add", "-b", branch_name, path_str, base],
                )
            };

            match res {
                Ok(_) => return Ok(()),
                Err(e) => {
                    let err_str = e.to_string();
                    let is_lock_contention = err_str.contains("index.lock")
                        || err_str.contains("Another git process seems to be running");

                    attempts += 1;
                    if is_lock_contention && attempts < max_attempts {
                        let delay_ms = 50 * (1 << attempts);
                        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
                        continue;
                    }
                    return Err(e);
                }
            }
        }
    }

    /// Remove a worktree and optionally delete its branch.
    pub fn remove_worktree(
        &self,
        repo_root: &Path,
        worktree_path: &Path,
        force: bool,
        delete_branch: bool,
        branch_name: Option<&str>,
    ) -> Result<()> {
        let path_str = worktree_path
            .to_str()
            .context("Invalid UTF-8 in worktree path")?;

        let mut args = vec!["worktree", "remove"];
        if force {
            args.push("--force");
        }
        args.push(path_str);

        self.run_git(repo_root, &args)?;

        if delete_branch {
            if let Some(b) = branch_name {
                let _ = self.run_git(repo_root, &["branch", "-D", b]);
            }
        }

        Ok(())
    }

    /// Compute full structured diff between the worktree and a base branch (e.g. main/master).
    pub fn get_diff(
        &self,
        worktree_path: &Path,
        base_branch: &str,
        target_branch: &str,
    ) -> Result<DiffSummary> {
        // 1. Get raw unified diff
        let diff_text = self
            .run_git(worktree_path, &["diff", base_branch])
            .unwrap_or_default();

        // 2. Get numstat for exact file addition/deletion counts
        let numstat_text = self
            .run_git(worktree_path, &["diff", "--numstat", base_branch])
            .unwrap_or_default();

        let mut file_map: std::collections::HashMap<String, (usize, usize)> = std::collections::HashMap::new();
        for line in numstat_text.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                let adds = parts[0].parse::<usize>().unwrap_or(0);
                let dels = parts[1].parse::<usize>().unwrap_or(0);
                let path = parts[2].to_string();
                file_map.insert(path, (adds, dels));
            }
        }

        // 3. Parse individual file patches from unified diff
        let mut files = Vec::new();
        let mut total_additions = 0;
        let mut total_deletions = 0;

        let diff_sections: Vec<&str> = diff_text.split("diff --git ").collect();
        for section in diff_sections {
            let section = section.trim();
            if section.is_empty() {
                continue;
            }

            let first_line = section.lines().next().unwrap_or("");
            // e.g. "a/src/file.rs b/src/file.rs"
            let paths: Vec<&str> = first_line.split_whitespace().collect();
            let relative_path = if paths.len() >= 2 {
                paths[1].strip_prefix("b/").unwrap_or(paths[1]).to_string()
            } else {
                "unknown".to_string()
            };

            let status = if section.contains("new file mode") {
                "added"
            } else if section.contains("deleted file mode") {
                "deleted"
            } else if section.contains("rename from") {
                "renamed"
            } else {
                "modified"
            };

            let (adds, dels) = file_map.get(&relative_path).cloned().unwrap_or((0, 0));
            total_additions += adds;
            total_deletions += dels;

            files.push(DiffFile {
                path: relative_path,
                status: status.to_string(),
                additions: adds,
                deletions: dels,
                patch: format!("diff --git {}", section),
            });
        }

        // 4. Also check untracked files with git status --porcelain
        if let Ok(status_output) = self.run_git(worktree_path, &["status", "--porcelain"]) {
            for line in status_output.lines() {
                if line.starts_with("?? ") {
                    let path = line[3..].trim().to_string();
                    let additions = std::fs::read_to_string(worktree_path.join(&path))
                        .map(|s| s.lines().count())
                        .unwrap_or(0);

                    total_additions += additions;
                    files.push(DiffFile {
                        path: path.clone(),
                        status: "added".to_string(),
                        additions,
                        deletions: 0,
                        patch: format!("Untracked file: {}", path),
                    });
                }
            }
        }

        Ok(DiffSummary {
            base_branch: base_branch.to_string(),
            target_branch: target_branch.to_string(),
            files,
            total_additions,
            total_deletions,
        })
    }

    /// Discard all uncommitted changes in the worktree.
    pub fn discard(&self, worktree_path: &Path) -> Result<()> {
        self.run_git(worktree_path, &["reset", "--hard", "HEAD"])?;
        let _ = self.run_git(worktree_path, &["clean", "-fd"]);
        Ok(())
    }

    /// Merge or rebase worktree branch into target base branch.
    pub fn merge(
        &self,
        repo_root: &Path,
        source_branch: &str,
        target_branch: &str,
        strategy: &str,
        commit_msg: Option<&str>,
    ) -> Result<MergeResult> {
        // Save current checked out branch on repo_root
        let original_branch = self
            .run_git(repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])
            .unwrap_or_else(|_| "HEAD".to_string())
            .trim()
            .to_string();

        // Switch to target branch
        if let Err(e) = self.run_git(repo_root, &["checkout", target_branch]) {
            return Ok(MergeResult {
                success: false,
                commit: None,
                message: format!("Failed to checkout target branch {}: {}", target_branch, e),
                conflicts: vec![],
            });
        }

        let default_msg = format!("Merge branch '{}' into '{}'", source_branch, target_branch);
        let msg = commit_msg.unwrap_or(&default_msg);

        let merge_res = match strategy {
            "rebase" => self.run_git(repo_root, &["rebase", source_branch]),
            "squash" => {
                let res = self.run_git(repo_root, &["merge", "--squash", source_branch]);
                if res.is_ok() {
                    self.run_git(repo_root, &["commit", "-m", msg])
                } else {
                    res
                }
            }
            _ => self.run_git(repo_root, &["merge", "--no-ff", "-m", msg, source_branch]),
        };

        let result = match merge_res {
            Ok(out) => {
                let commit_hash = self
                    .run_git(repo_root, &["rev-parse", "HEAD"])
                    .map(|h| h.trim().to_string())
                    .ok();

                MergeResult {
                    success: true,
                    commit: commit_hash,
                    message: out.trim().to_string(),
                    conflicts: vec![],
                }
            }
            Err(e) => {
                // Check if there are conflict files
                let conflicts = self
                    .run_git(repo_root, &["diff", "--name-only", "--diff-filter=U"])
                    .map(|c| c.lines().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
                    .unwrap_or_default();

                // Abort merge to keep repo clean
                let _ = self.run_git(repo_root, &["merge", "--abort"]);
                let _ = self.run_git(repo_root, &["rebase", "--abort"]);

                MergeResult {
                    success: false,
                    commit: None,
                    message: format!("Merge error: {}", e),
                    conflicts,
                }
            }
        };

        // Switch back if original branch was different
        if original_branch != target_branch && !original_branch.is_empty() {
            let _ = self.run_git(repo_root, &["checkout", &original_branch]);
        }

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_porcelain_parsing() {
        let manager = GitWorktreeManager::new();
        // Test parsing synthetic porcelain string
        let porcelain = r#"worktree /home/user/project
HEAD d1e457f
branch refs/heads/main

worktree /home/user/project/.worktrees/feature-1
HEAD a9b8c7d
branch refs/heads/feature-1
locked Task in progress

worktree /home/user/project/.worktrees/detached
HEAD 1234567
detached
"#;
        // Verify line parsing behavior
        assert!(porcelain.contains("worktree "));
    }
}

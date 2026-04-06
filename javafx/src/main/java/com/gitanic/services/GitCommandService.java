package com.gitanic.services;

import com.gitanic.models.CommitEntry;
import com.gitanic.models.FileStatus;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Executes local Git commands via ProcessBuilder.
 * Pattern: Singleton. All methods throw on non-zero exit codes.
 */
public final class GitCommandService {

    private static GitCommandService instance;

    private GitCommandService() {}

    public static synchronized GitCommandService getInstance() {
        if (instance == null) {
            instance = new GitCommandService();
        }
        return instance;
    }

    // ================================================================
    //  Core execution
    // ================================================================

    /**
     * Runs a git command in the given directory and returns stdout.
     * Stderr is merged into stdout. Throws GitException on non-zero exit.
     */
    public String run(File dir, String... args) throws Exception {
        List<String> cmd = new ArrayList<>();
        cmd.add("git");
        cmd.addAll(Arrays.asList(args));

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(dir);
        pb.redirectErrorStream(true);

        // Prevent interactive password prompts — fail fast instead
        Map<String, String> env = pb.environment();
        env.put("GIT_TERMINAL_PROMPT", "0");
        env.put("GIT_ASKPASS", "echo");

        Process process = pb.start();
        String output;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
            output = reader.lines().collect(Collectors.joining("\n"));
        }
        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new Exception(output.isBlank()
                    ? "git " + String.join(" ", args) + " failed (exit " + exitCode + ")"
                    : output);
        }
        return output;
    }

    /** Same as run() but never throws — returns empty string on failure. */
    private String runSilent(File dir, String... args) {
        try { return run(dir, args); } catch (Exception e) { return ""; }
    }

    // ================================================================
    //  Clone
    // ================================================================

    /**
     * Clones a remote repository.
     * @param authUrl  authenticated URL including credentials
     * @param parentDir  parent directory; the repo will be cloned inside it
     * @param repoName  name of the directory to create
     */
    public void clone(String authUrl, File parentDir, String repoName) throws Exception {
        List<String> cmd = new ArrayList<>();
        cmd.add("git");
        cmd.add("clone");
        cmd.add(authUrl);
        if (repoName != null && !repoName.isBlank()) cmd.add(repoName);

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(parentDir);
        pb.redirectErrorStream(true);
        Map<String, String> env = pb.environment();
        env.put("GIT_TERMINAL_PROMPT", "0");
        env.put("GIT_ASKPASS", "echo");

        Process process = pb.start();
        String output;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
            output = reader.lines().collect(Collectors.joining("\n"));
        }
        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new Exception("Clone failed:\n" + output);
        }
    }

    // ================================================================
    //  Repository info
    // ================================================================

    public String getCurrentBranch(File repoDir) {
        // Works for empty repos where HEAD is symbolic but has no commit yet.
        String result = runSilent(repoDir, "branch", "--show-current").trim();
        if (!result.isEmpty()) return result;

        result = runSilent(repoDir, "symbolic-ref", "--short", "HEAD").trim();
        if (!result.isEmpty()) return result;

        result = runSilent(repoDir, "rev-parse", "--abbrev-ref", "HEAD").trim();
        return result.isEmpty() ? "main" : result;
    }

    public String getRemoteUrl(File repoDir) {
        return runSilent(repoDir, "remote", "get-url", "origin").trim();
    }

    // ================================================================
    //  Status
    // ================================================================

    /**
     * Returns all changed files parsed from `git status --porcelain`.
     */
    public List<FileStatus> getStatus(File repoDir) throws Exception {
        String output = run(repoDir, "status", "--porcelain");
        List<FileStatus> result = new ArrayList<>();
        for (String line : output.split("\n")) {
            if (line.length() >= 3) {
                FileStatus fs = FileStatus.parse(line);
                if (fs != null) result.add(fs);
            }
        }
        return result;
    }

    // ================================================================
    //  Diff
    // ================================================================

    /** All unstaged changes. */
    public String getDiff(File repoDir) throws Exception {
        String out = run(repoDir, "diff");
        return out.isBlank() ? "(no unstaged changes)" : out;
    }

    /** Unstaged diff for one file. */
    public String getDiffForFile(File repoDir, String path) throws Exception {
        String out = run(repoDir, "diff", "--", path);
        return out.isBlank() ? "(no unstaged changes for " + path + ")" : out;
    }

    /**
     * Diff for a file against HEAD — covers both staged and unstaged changes.
     * Falls back to --cached for newly staged files not yet in HEAD.
     * Used by the workspace file list diff viewer.
     */
    public String getDiffAgainstHead(File repoDir, String path) throws Exception {
        String out = runSilent(repoDir, "diff", "HEAD", "--", path);
        if (!out.isBlank()) return out;
        // New file added to index but HEAD doesn't exist yet: show cached diff
        out = runSilent(repoDir, "diff", "--cached", "--", path);
        if (!out.isBlank()) return out;
        return "(no diff available for " + path + ")";
    }

    /** All staged changes. */
    public String getStagedDiff(File repoDir) throws Exception {
        String out = run(repoDir, "diff", "--cached");
        return out.isBlank() ? "(no staged changes)" : out;
    }

    /** Staged diff for one file. */
    public String getStagedDiffForFile(File repoDir, String path) throws Exception {
        String out = run(repoDir, "diff", "--cached", "--", path);
        return out.isBlank() ? "(no staged changes for " + path + ")" : out;
    }

    // ================================================================
    //  Staging
    // ================================================================

    public void stageFile(File repoDir, String path) throws Exception {
        run(repoDir, "add", "--", path);
    }

    public void stageAll(File repoDir) throws Exception {
        run(repoDir, "add", ".");
    }

    public void unstageFile(File repoDir, String path) throws Exception {
        // `git restore --staged` is the modern approach (git 2.23+)
        try {
            run(repoDir, "restore", "--staged", "--", path);
        } catch (Exception e) {
            // fallback to reset HEAD for older git
            run(repoDir, "reset", "HEAD", "--", path);
        }
    }

    public void unstageAll(File repoDir) throws Exception {
        try {
            run(repoDir, "restore", "--staged", ".");
        } catch (Exception e) {
            run(repoDir, "reset", "HEAD");
        }
    }

    // ================================================================
    //  Commit
    // ================================================================

    public void commit(File repoDir, String message) throws Exception {
        run(repoDir, "commit", "-m", message);
    }

    public void commitAmend(File repoDir, String message) throws Exception {
        run(repoDir, "commit", "--amend", "-m", message);
    }

    /**
     * Stages all changes then commits. Equivalent to: git add . && git commit -m "msg"
     * Throws if there are no changes or the message is blank.
     */
    public void commitAll(File repoDir, String message) throws Exception {
        if (message == null || message.isBlank()) {
            throw new Exception("Commit message cannot be empty.");
        }
        run(repoDir, "add", ".");
        run(repoDir, "commit", "-m", message);
    }

    // ================================================================
    //  History
    // ================================================================

    /**
     * Returns the last {@code maxCount} commits as CommitEntry objects.
     * Uses pipe-delimited format: hash|authorName|authorEmail|date|subject
     */
    public List<CommitEntry> getLog(File repoDir, int maxCount) throws Exception {
        // Freshly cloned empty repos have no HEAD commit yet.
        if (runSilent(repoDir, "rev-parse", "HEAD").isBlank()) {
            return new ArrayList<>();
        }

        String fmt    = "--pretty=format:%H|%an|%ae|%ad|%s";
        String dateArg = "--date=short";
        String nArg   = "-n";
        String nVal   = String.valueOf(maxCount);

        String output = run(repoDir, "log", fmt, dateArg, nArg, nVal);
        List<CommitEntry> result = new ArrayList<>();
        for (String line : output.split("\n")) {
            if (!line.isBlank()) {
                CommitEntry entry = CommitEntry.parse(line);
                if (entry != null) result.add(entry);
            }
        }
        return result;
    }

    /**
     * Returns the full diff introduced by a specific commit.
     */
    public String getCommitDiff(File repoDir, String commitHash) throws Exception {
        return run(repoDir, "show", "--stat", "--patch", commitHash);
    }

    // ================================================================
    //  Remote operations
    // ================================================================

    public String fetch(File repoDir) throws Exception {
        return run(repoDir, "fetch", "--all", "--prune");
    }

    /**
     * Pulls using credentials embedded in the remote URL.
     * Falls back to plain `git pull` if no auth URL available.
     */
    public String pull(File repoDir, String authUrl) throws Exception {
        if (authUrl != null && !authUrl.isBlank()) {
            // Temporarily update origin and pull
            String currentRemote = getRemoteUrl(repoDir);
            try {
                runSilent(repoDir, "remote", "set-url", "origin", authUrl);
                return run(repoDir, "pull");
            } finally {
                // Restore clean URL (without credentials) from original
                if (!currentRemote.isBlank()) {
                    String cleanUrl = stripCredentials(authUrl);
                    runSilent(repoDir, "remote", "set-url", "origin", cleanUrl);
                }
            }
        }
        return run(repoDir, "pull");
    }

    /**
     * Pushes using credentials embedded in the auth URL.
     */
    public String push(File repoDir, String authUrl) throws Exception {
        if (authUrl != null && !authUrl.isBlank()) {
            String currentRemote = getRemoteUrl(repoDir);
            try {
                runSilent(repoDir, "remote", "set-url", "origin", authUrl);
                // --set-upstream origin HEAD: works for both first push (no tracking branch)
                // and subsequent pushes; HEAD pushes whatever branch is currently checked out
                return run(repoDir, "push", "--set-upstream", "origin", "HEAD");
            } finally {
                if (!currentRemote.isBlank()) {
                    String cleanUrl = stripCredentials(authUrl);
                    runSilent(repoDir, "remote", "set-url", "origin", cleanUrl);
                }
            }
        }
        return run(repoDir, "push", "--set-upstream", "origin", "HEAD");
    }

    // ================================================================
    //  Revert
    // ================================================================

    /**
     * Reverts a specific commit by creating a new revert commit.
     * Uses `git revert --no-edit` to auto-generate the revert message.
     */
    public String revert(File repoDir, String commitHash) throws Exception {
        return run(repoDir, "revert", "--no-edit", commitHash);
    }

    // ================================================================
    //  File content
    // ================================================================

    /**
     * Reads the full content of a file in the working tree.
     */
    public String readFileContent(File repoDir, String path) throws Exception {
        File file = new File(repoDir, path);
        if (!file.exists()) {
            return "(file not found: " + path + ")";
        }
        return new String(java.nio.file.Files.readAllBytes(file.toPath()));
    }

    /**
     * For new/untracked files, generates a diff-like output showing every line
     * as an addition (+). This is used when git diff has no output for new files.
     */
    public String getNewFileDiff(File repoDir, String path) throws Exception {
        File file = new File(repoDir, path);
        if (!file.exists()) {
            return "(file not found: " + path + ")";
        }
        String content = new String(java.nio.file.Files.readAllBytes(file.toPath()));
        StringBuilder sb = new StringBuilder();
        sb.append("diff --git a/").append(path).append(" b/").append(path).append("\n");
        sb.append("new file\n");
        sb.append("--- /dev/null\n");
        sb.append("+++ b/").append(path).append("\n");
        String[] lines = content.split("\n", -1);
        sb.append("@@ -0,0 +1,").append(lines.length).append(" @@\n");
        for (String line : lines) {
            sb.append("+").append(line).append("\n");
        }
        return sb.toString();
    }

    // ================================================================
    //  Helpers
    // ================================================================

    /**
     * Extracts the repo name from a .git URL.
     * e.g. http://host/git/user/myrepo.git → "myrepo"
     */
    public static String repoNameFromUrl(String url) {
        if (url == null) return "repo";
        String clean = url.replaceAll("/$", "");
        int slash = clean.lastIndexOf('/');
        String last = slash >= 0 ? clean.substring(slash + 1) : clean;
        return last.replaceAll("\\.git$", "");
    }

    /**
     * Remove embedded credentials from a URL.
     * http://user:pass@host/... → http://host/...
     */
    public static String stripCredentials(String url) {
        if (url == null) return "";
        int atSign = url.indexOf('@');
        int schemeEnd = url.indexOf("://");
        if (atSign > 0 && schemeEnd >= 0 && atSign > schemeEnd) {
            return url.substring(0, schemeEnd + 3) + url.substring(atSign + 1);
        }
        return url;
    }
}

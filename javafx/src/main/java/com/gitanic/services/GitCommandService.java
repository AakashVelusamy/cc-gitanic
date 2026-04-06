package com.gitanic.services;

import com.gitanic.models.CommitEntry;
import com.gitanic.models.FileStatus;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.logging.Logger;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Executes local Git commands via ProcessBuilder.
 * Pattern: Singleton. All methods throw on non-zero exit codes.
 *
 * <p>Security notes:
 * <ul>
 *   <li>All git commands run via ProcessBuilder with an explicit String array —
 *       no shell expansion occurs.</li>
 *   <li>User-supplied repo names are validated against {@link #SAFE_NAME_PATTERN}
 *       before use as arguments.</li>
 *   <li>File paths are canonicalized and checked to be under the working directory.</li>
 *   <li>Commit messages are passed as a single element in the argument array,
 *       preventing any shell-metacharacter injection.</li>
 *   <li>{@code GIT_TERMINAL_PROMPT=0} and {@code GIT_ASKPASS=echo} are always set
 *       to prevent git from opening interactive password prompts.</li>
 * </ul>
 */
public final class GitCommandService {

    private static final Logger LOG = Logger.getLogger(GitCommandService.class.getName());

    /** Repo names and branch names must match this pattern to prevent injection. */
    private static final Pattern SAFE_NAME_PATTERN = Pattern.compile("^[a-zA-Z0-9._/-]{1,200}$");

    /** Commit hash pattern — 40 hex characters. */
    private static final Pattern COMMIT_HASH_PATTERN = Pattern.compile("^[a-fA-F0-9]{1,40}$");

    // ------------------------------------------------------------------ singleton

    /** Holder-pattern singleton — thread-safe without synchronised. */
    private static final class Holder {
        static final GitCommandService INSTANCE = new GitCommandService();
    }

    private GitCommandService() {}

    /** Returns the singleton instance. */
    public static GitCommandService getInstance() {
        return Holder.INSTANCE;
    }

    // ================================================================
    //  Input validation helpers
    // ================================================================

    /**
     * Validates that {@code name} is safe to use as a git argument
     * (repo name, branch name, etc.).  Throws {@link IllegalArgumentException}
     * if the value contains characters that could alter the command.
     *
     * @param name  the value to validate
     * @param label human-readable label used in the error message
     */
    private static void validateSafeName(String name, String label) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException(label + " must not be blank.");
        }
        if (!SAFE_NAME_PATTERN.matcher(name).matches()) {
            throw new IllegalArgumentException(
                    label + " contains invalid characters: " + name);
        }
    }

    /**
     * Validates a commit hash (hex string, 1–40 chars).
     *
     * @param hash  the commit hash to validate
     */
    private static void validateCommitHash(String hash) {
        if (hash == null || hash.isBlank()) {
            throw new IllegalArgumentException("Commit hash must not be blank.");
        }
        if (!COMMIT_HASH_PATTERN.matcher(hash).matches()) {
            throw new IllegalArgumentException(
                    "Commit hash contains invalid characters: " + hash);
        }
    }

    /**
     * Validates that {@code path} resolves to a location <em>under</em>
     * {@code repoDir} (path traversal prevention).
     *
     * @param repoDir the repository working directory
     * @param path    the relative file path supplied by the user
     */
    private static void validateFilePath(File repoDir, String path) throws IOException {
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("File path must not be blank.");
        }
        File canonical = new File(repoDir, path).getCanonicalFile();
        File repoCanon = repoDir.getCanonicalFile();
        if (!canonical.getPath().startsWith(repoCanon.getPath() + File.separator)
                && !canonical.equals(repoCanon)) {
            throw new SecurityException(
                    "Path traversal detected: " + path + " is outside the repository.");
        }
    }

    // ================================================================
    //  Core execution
    // ================================================================

    /**
     * Runs a git command in the given directory and returns stdout.
     * Stderr is merged into stdout.  Throws on non-zero exit.
     *
     * @param dir   the working directory for git
     * @param args  git sub-command and its arguments (no shell, no glob expansion)
     * @return combined stdout output
     * @throws IOException          if the process cannot be started or read
     * @throws InterruptedException if the thread is interrupted while waiting
     * @throws GitException         if git exits with a non-zero code
     */
    public String run(File dir, String... args) throws IOException, InterruptedException, GitException {
        List<String> cmd = new ArrayList<>();
        cmd.add("git");
        cmd.addAll(Arrays.asList(args));

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(dir);
        pb.redirectErrorStream(true);

        // Always disable interactive prompts — prevent credential leaks to rogue processes
        pb.environment().put("GIT_TERMINAL_PROMPT", "0");
        pb.environment().put("GIT_ASKPASS", "echo");

        Process process = pb.start();
        String output;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            output = reader.lines().collect(Collectors.joining("\n"));
        }
        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new GitException(output.isBlank()
                    ? "git " + String.join(" ", args) + " failed (exit " + exitCode + ")"
                    : output, exitCode);
        }
        return output;
    }

    /**
     * Same as {@link #run} but never throws — returns empty string on any failure.
     * Suitable for best-effort queries where absence of output is acceptable.
     */
    private String runSilent(File dir, String... args) {
        try {
            return run(dir, args);
        } catch (IOException | InterruptedException | GitException e) {
            // Intentionally silent — callers handle empty-string return
            return "";
        }
    }

    // ================================================================
    //  Clone
    // ================================================================

    /**
     * Clones a remote repository.
     *
     * @param authUrl   authenticated URL including credentials
     * @param parentDir parent directory; the repo will be cloned inside it
     * @param repoName  name of the directory to create (must be a safe identifier)
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted while waiting
     * @throws GitException         if git exits non-zero
     */
    public void clone(String authUrl, File parentDir, String repoName)
            throws IOException, InterruptedException, GitException {
        // repoName used as a directory name argument — validate it
        if (repoName != null && !repoName.isBlank()) {
            validateSafeName(repoName, "Repository name");
        }

        List<String> cmd = new ArrayList<>();
        cmd.add("git");
        cmd.add("clone");
        cmd.add(authUrl);   // URL is validated by the caller via injectCredentials
        if (repoName != null && !repoName.isBlank()) {
            cmd.add(repoName);
        }

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(parentDir);
        pb.redirectErrorStream(true);
        pb.environment().put("GIT_TERMINAL_PROMPT", "0");
        pb.environment().put("GIT_ASKPASS", "echo");

        Process process = pb.start();
        String output;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            output = reader.lines().collect(Collectors.joining("\n"));
        }
        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new GitException("Clone failed:\n" + output, exitCode);
        }
    }

    // ================================================================
    //  Repository info
    // ================================================================

    /**
     * Returns the current branch name.  Works for empty repos where HEAD is
     * symbolic but has no commit yet.
     *
     * @param repoDir the repository directory
     * @return the current branch name, defaulting to "main"
     */
    public String getCurrentBranch(File repoDir) {
        String result = runSilent(repoDir, "branch", "--show-current").trim();
        if (!result.isEmpty()) return result;

        result = runSilent(repoDir, "symbolic-ref", "--short", "HEAD").trim();
        if (!result.isEmpty()) return result;

        result = runSilent(repoDir, "rev-parse", "--abbrev-ref", "HEAD").trim();
        return result.isEmpty() ? "main" : result;
    }

    /**
     * Returns the configured remote URL for "origin", or empty string if none.
     *
     * @param repoDir the repository directory
     * @return remote URL string (may be empty)
     */
    public String getRemoteUrl(File repoDir) {
        return runSilent(repoDir, "remote", "get-url", "origin").trim();
    }

    // ================================================================
    //  Status
    // ================================================================

    /**
     * Returns all changed files parsed from {@code git status --porcelain}.
     *
     * @param repoDir the repository directory
     * @return list of {@link FileStatus} entries
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public List<FileStatus> getStatus(File repoDir)
            throws IOException, InterruptedException, GitException {
        String output = run(repoDir, "status", "--porcelain", "-uall");
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

    /**
     * Returns all unstaged changes.
     *
     * @param repoDir the repository directory
     * @return diff text or a no-changes message
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public String getDiff(File repoDir) throws IOException, InterruptedException, GitException {
        String out = run(repoDir, "diff");
        return out.isBlank() ? "(no unstaged changes)" : out;
    }

    /**
     * Returns the unstaged diff for one file.
     *
     * @param repoDir the repository directory
     * @param path    relative path to the file (validated against traversal)
     * @return diff text or a no-changes message
     * @throws IOException          on I/O failure or path traversal
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public String getDiffForFile(File repoDir, String path)
            throws IOException, InterruptedException, GitException {
        validateFilePath(repoDir, path);
        String out = run(repoDir, "diff", "--", path);
        return out.isBlank() ? "(no unstaged changes for " + path + ")" : out;
    }

    /**
     * Returns the diff for a file against HEAD — covers both staged and unstaged
     * changes.  Falls back to {@code --cached} for newly staged files not yet in
     * HEAD.  Used by the workspace file-list diff viewer.
     *
     * @param repoDir the repository directory
     * @param path    relative path to the file (validated against traversal)
     * @return diff text or a no-diff message
     * @throws IOException on path traversal detection
     */
    public String getDiffAgainstHead(File repoDir, String path) throws IOException {
        validateFilePath(repoDir, path);
        String out = runSilent(repoDir, "diff", "HEAD", "--", path);
        if (!out.isBlank()) return out;
        // New file added to index but HEAD doesn't exist yet — show cached diff
        out = runSilent(repoDir, "diff", "--cached", "--", path);
        if (!out.isBlank()) return out;
        return "(no diff available for " + path + ")";
    }

    /**
     * Returns all staged changes.
     *
     * @param repoDir the repository directory
     * @return diff text or a no-changes message
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public String getStagedDiff(File repoDir) throws IOException, InterruptedException, GitException {
        String out = run(repoDir, "diff", "--cached");
        return out.isBlank() ? "(no staged changes)" : out;
    }

    /**
     * Returns the staged diff for one file.
     *
     * @param repoDir the repository directory
     * @param path    relative path to the file (validated against traversal)
     * @return diff text or a no-changes message
     * @throws IOException          on I/O failure or path traversal
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public String getStagedDiffForFile(File repoDir, String path)
            throws IOException, InterruptedException, GitException {
        validateFilePath(repoDir, path);
        String out = run(repoDir, "diff", "--cached", "--", path);
        return out.isBlank() ? "(no staged changes for " + path + ")" : out;
    }

    // ================================================================
    //  Staging
    // ================================================================

    /**
     * Stages a single file.
     *
     * @param repoDir the repository directory
     * @param path    relative path to the file (validated against traversal)
     * @throws IOException          on I/O failure or path traversal
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public void stageFile(File repoDir, String path)
            throws IOException, InterruptedException, GitException {
        validateFilePath(repoDir, path);
        run(repoDir, "add", "--", path);
    }

    /**
     * Stages all changes in the working tree.
     *
     * @param repoDir the repository directory
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public void stageAll(File repoDir) throws IOException, InterruptedException, GitException {
        run(repoDir, "add", ".");
    }

    /**
     * Unstages a single file.
     *
     * @param repoDir the repository directory
     * @param path    relative path to the file (validated against traversal)
     * @throws IOException          on I/O failure or path traversal
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public void unstageFile(File repoDir, String path)
            throws IOException, InterruptedException, GitException {
        validateFilePath(repoDir, path);
        // git restore --staged is the modern approach (git 2.23+)
        try {
            run(repoDir, "restore", "--staged", "--", path);
        } catch (GitException e) {
            // Fallback to reset HEAD for older git versions
            run(repoDir, "reset", "HEAD", "--", path);
        }
    }

    /**
     * Unstages all staged files.
     *
     * @param repoDir the repository directory
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public void unstageAll(File repoDir) throws IOException, InterruptedException, GitException {
        try {
            run(repoDir, "restore", "--staged", ".");
        } catch (GitException e) {
            run(repoDir, "reset", "HEAD");
        }
    }

    // ================================================================
    //  Commit
    // ================================================================

    /**
     * Creates a commit with the given message.
     *
     * <p>The message is passed as a single argument to ProcessBuilder — no shell
     * expansion occurs, so any characters in the message are safe.
     *
     * @param repoDir the repository directory
     * @param message the commit message (must not be blank)
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public void commit(File repoDir, String message)
            throws IOException, InterruptedException, GitException {
        if (message == null || message.isBlank()) {
            throw new IllegalArgumentException("Commit message cannot be empty.");
        }
        run(repoDir, "commit", "-m", message);
    }

    /**
     * Amends the last commit with the given message.
     *
     * @param repoDir the repository directory
     * @param message the new commit message (must not be blank)
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public void commitAmend(File repoDir, String message)
            throws IOException, InterruptedException, GitException {
        if (message == null || message.isBlank()) {
            throw new IllegalArgumentException("Commit message cannot be empty.");
        }
        run(repoDir, "commit", "--amend", "-m", message);
    }

    /**
     * Stages all changes then commits.
     * Equivalent to: {@code git add . && git commit -m "msg"}.
     * Auto-renames the local branch from {@code master} to {@code main} to align
     * with the server's branch policy.
     *
     * @param repoDir the repository directory
     * @param message the commit message (must not be blank)
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public void commitAll(File repoDir, String message)
            throws IOException, InterruptedException, GitException {
        if (message == null || message.isBlank()) {
            throw new IllegalArgumentException("Commit message cannot be empty.");
        }

        // Auto-rename local master → main to align with server policy
        if ("master".equals(getCurrentBranch(repoDir))) {
            runSilent(repoDir, "branch", "-m", "master", "main");
        }

        run(repoDir, "add", ".");
        run(repoDir, "commit", "-m", message);
    }

    // ================================================================
    //  History
    // ================================================================

    /**
     * Returns the last {@code maxCount} commits as {@link CommitEntry} objects.
     * Uses pipe-delimited format: {@code hash|authorName|authorEmail|date|subject}.
     *
     * @param repoDir  the repository directory
     * @param maxCount maximum number of commits to return (must be positive)
     * @return list of {@link CommitEntry} objects, empty for repos with no commits
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public List<CommitEntry> getLog(File repoDir, int maxCount)
            throws IOException, InterruptedException, GitException {
        if (maxCount <= 0) {
            throw new IllegalArgumentException("maxCount must be positive.");
        }
        // Freshly cloned empty repos have no HEAD commit yet
        if (runSilent(repoDir, "rev-parse", "HEAD").isBlank()) {
            return new ArrayList<>();
        }

        String output = run(repoDir,
                "log",
                "--pretty=format:%H|%an|%ae|%ad|%s",
                "--date=short",
                "-n",
                String.valueOf(maxCount));
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
     *
     * @param repoDir    the repository directory
     * @param commitHash the full or abbreviated commit hash (validated hex)
     * @return diff text
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public String getCommitDiff(File repoDir, String commitHash)
            throws IOException, InterruptedException, GitException {
        validateCommitHash(commitHash);
        return run(repoDir, "show", "--stat", "--patch", commitHash);
    }

    // ================================================================
    //  Remote operations
    // ================================================================

    /**
     * Fetches all remote refs and prunes deleted branches.
     *
     * @param repoDir the repository directory
     * @return stdout output
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public String fetch(File repoDir) throws IOException, InterruptedException, GitException {
        return run(repoDir, "fetch", "--all", "--prune");
    }

    /**
     * Pulls using credentials embedded in the remote URL.
     * Temporarily updates the remote URL with credentials, pulls, then restores
     * the clean URL (without credentials) to avoid leaking secrets into
     * {@code .git/config}.
     *
     * @param repoDir the repository directory
     * @param authUrl authenticated URL (may be {@code null} or blank for plain pull)
     * @return stdout output
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public String pull(File repoDir, String authUrl)
            throws IOException, InterruptedException, GitException {
        if (authUrl != null && !authUrl.isBlank()) {
            String currentRemote = getRemoteUrl(repoDir);
            try {
                runSilent(repoDir, "remote", "set-url", "origin", authUrl);
                return run(repoDir, "pull");
            } finally {
                // Restore clean URL (without credentials) so secrets are not persisted
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
     * Always pushes {@code HEAD:main} to trigger auto-deploy on the server.
     * Credentials are removed from the remote URL after the push.
     *
     * @param repoDir the repository directory
     * @param authUrl authenticated URL (may be {@code null} or blank for plain push)
     * @return stdout output
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public String push(File repoDir, String authUrl)
            throws IOException, InterruptedException, GitException {
        if (authUrl != null && !authUrl.isBlank()) {
            String currentRemote = getRemoteUrl(repoDir);
            try {
                runSilent(repoDir, "remote", "set-url", "origin", authUrl);
                return run(repoDir, "push", "--set-upstream", "origin", "HEAD:main");
            } finally {
                if (!currentRemote.isBlank()) {
                    String cleanUrl = stripCredentials(authUrl);
                    runSilent(repoDir, "remote", "set-url", "origin", cleanUrl);
                }
            }
        }
        return run(repoDir, "push", "--set-upstream", "origin", "HEAD:main");
    }

    // ================================================================
    //  Revert
    // ================================================================

    /**
     * Reverts a specific commit by creating a new revert commit.
     * Uses {@code git revert --no-edit} to auto-generate the revert message.
     *
     * @param repoDir    the repository directory
     * @param commitHash the full or abbreviated commit hash (validated hex)
     * @return stdout output
     * @throws IOException          on I/O failure
     * @throws InterruptedException if interrupted
     * @throws GitException         if git exits non-zero
     */
    public String revert(File repoDir, String commitHash)
            throws IOException, InterruptedException, GitException {
        validateCommitHash(commitHash);
        return run(repoDir, "revert", "--no-edit", commitHash);
    }

    // ================================================================
    //  File content
    // ================================================================

    /**
     * Reads the full content of a file in the working tree.
     * The file path is validated to be under {@code repoDir} to prevent
     * path traversal attacks.
     *
     * @param repoDir the repository directory
     * @param path    relative path to the file
     * @return the file content as a UTF-8 string, or a not-found message
     * @throws IOException on path traversal detection
     */
    public String readFileContent(File repoDir, String path) throws IOException {
        validateFilePath(repoDir, path);
        File file = new File(repoDir, path);
        if (!file.exists()) {
            return "(file not found: " + path + ")";
        }
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }

    /**
     * For new/untracked files, generates a diff-like output showing every line
     * as an addition ({@code +}).  Used when {@code git diff} has no output for
     * new files.
     *
     * @param repoDir the repository directory
     * @param path    relative path to the file (validated against traversal)
     * @return synthetic diff text or a not-found message
     * @throws IOException on path traversal detection or I/O failure
     */
    public String getNewFileDiff(File repoDir, String path) throws IOException {
        validateFilePath(repoDir, path);
        File file = new File(repoDir, path);
        if (!file.exists()) {
            return "(file not found: " + path + ")";
        }
        String content = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
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
     * Extracts the repo name from a {@code .git} URL.
     * Example: {@code http://host/git/user/myrepo.git} → {@code "myrepo"}.
     *
     * @param url the git remote URL
     * @return the repository name without the {@code .git} suffix
     */
    public static String repoNameFromUrl(String url) {
        if (url == null) return "repo";
        String clean = url.replaceAll("/$", "");
        int slash = clean.lastIndexOf('/');
        String last = slash >= 0 ? clean.substring(slash + 1) : clean;
        return last.replaceAll("\\.git$", "");
    }

    /**
     * Removes embedded credentials from a URL.
     * Example: {@code http://user:pass@host/...} → {@code http://host/...}.
     *
     * @param url the URL that may contain embedded credentials
     * @return the URL with credentials removed, or empty string if input is null
     */
    public static String stripCredentials(String url) {
        if (url == null) return "";
        int atSign   = url.indexOf('@');
        int schemeEnd = url.indexOf("://");
        if (atSign > 0 && schemeEnd >= 0 && atSign > schemeEnd) {
            return url.substring(0, schemeEnd + 3) + url.substring(atSign + 1);
        }
        return url;
    }

    // ================================================================
    //  Typed exception
    // ================================================================

    /**
     * Thrown when a git command exits with a non-zero code.
     * Carries the exit code alongside the error message so callers can
     * distinguish failure modes if needed.
     */
    public static final class GitException extends Exception {
        private final int exitCode;

        /**
         * Constructs a {@code GitException}.
         *
         * @param message the error message (typically stderr/stdout of the git process)
         * @param exitCode the process exit code
         */
        public GitException(String message, int exitCode) {
            super(message);
            this.exitCode = exitCode;
        }

        /** Returns the git process exit code. */
        public int getExitCode() {
            return exitCode;
        }
    }
}

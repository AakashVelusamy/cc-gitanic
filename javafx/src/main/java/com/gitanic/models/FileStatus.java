package com.gitanic.models;

/**
 * Represents one line of {@code git status --porcelain} output.
 *
 * <p>Column layout: {@code XY PATH} or {@code XY ORIG -> PATH} (renames).
 * {@code X} is the index (staged) status; {@code Y} is the worktree
 * (unstaged) status.
 */
public class FileStatus {

    /**
     * Status codes that appear in the X and Y columns of porcelain output.
     */
    public enum Code {
        /** Modified in index or worktree. */
        MODIFIED(' ', 'M'),
        /** Added to the index. */
        ADDED(   'A', 'A'),
        /** Deleted from the index or worktree. */
        DELETED( 'D', 'D'),
        /** Renamed. */
        RENAMED( 'R', 'R'),
        /** Copied. */
        COPIED(  'C', 'C'),
        /** Untracked file. */
        UNTRACKED('?', '?'),
        /** Ignored file. */
        IGNORED(  '!', '!'),
        /** Unmerged (conflict). */
        UNMERGED( 'U', 'U'),
        /** No change. */
        NONE(     ' ', ' ');

        /** Character used in the X (staged) column. */
        public final char staged;
        /** Character used in the Y (unstaged) column. */
        public final char unstaged;

        Code(char staged, char unstaged) {
            this.staged   = staged;
            this.unstaged = unstaged;
        }

        /**
         * Returns the {@link Code} whose staged or unstaged character matches {@code c},
         * or {@link Code#NONE} if no match is found.
         *
         * @param c the porcelain status character
         * @return the matching code
         */
        public static Code fromChar(char c) {
            for (Code code : values()) {
                if (code.staged == c || code.unstaged == c) return code;
            }
            return NONE;
        }
    }

    private final String path;
    private final String origPath;   // non-null for renames/copies
    private final Code   x;          // index (staged) status
    private final Code   y;          // worktree (unstaged) status

    /**
     * Constructs a {@link FileStatus} entry.
     *
     * @param path     the current (destination) path
     * @param origPath the original path for renames/copies, or {@code null}
     * @param x        the staged status code
     * @param y        the unstaged status code
     */
    public FileStatus(String path, String origPath, Code x, Code y) {
        this.path     = path;
        this.origPath = origPath;
        this.x        = x;
        this.y        = y;
    }

    // ---- Getters -------------------------------------------------------

    /**
     * Returns the current (destination) file path.
     *
     * @return relative path string
     */
    public String getPath()     { return path; }

    /**
     * Returns the original path for renames and copies, or {@code null}.
     *
     * @return original path, or {@code null}
     */
    public String getOrigPath() { return origPath; }

    /**
     * Returns the staged (index) status code.
     *
     * @return X column code
     */
    public Code   getX()        { return x; }

    /**
     * Returns the unstaged (worktree) status code.
     *
     * @return Y column code
     */
    public Code   getY()        { return y; }

    /**
     * Returns {@code true} if this file has staged changes (shown in Staged panel).
     *
     * @return {@code true} if staged
     */
    public boolean isStaged() {
        return x != Code.NONE && x != Code.UNTRACKED;
    }

    /**
     * Returns {@code true} if this file has unstaged or untracked changes
     * (shown in Changes panel).
     *
     * @return {@code true} if unstaged or untracked
     */
    public boolean isUnstaged() {
        boolean untracked = x == Code.UNTRACKED && y == Code.UNTRACKED;
        return untracked || (y != Code.NONE && y != Code.IGNORED);
    }

    /**
     * Returns the display string for the staged list cell.
     *
     * @return formatted string with status code and path
     */
    public String getStagedLabel() {
        return x.staged + "  " + path;
    }

    /**
     * Returns the display string for the unstaged/changes list cell.
     *
     * @return formatted string with status code and path
     */
    public String getUnstagedLabel() {
        char code = (x == Code.UNTRACKED) ? '?' : y.unstaged;
        return code + "  " + path;
    }

    // ---- Factory -------------------------------------------------------

    /**
     * Parses one porcelain status line.
     * Returns {@code null} for blank or malformed lines.
     *
     * @param line one line from {@code git status --porcelain}
     * @return parsed {@link FileStatus}, or {@code null}
     */
    public static FileStatus parse(String line) {
        if (line == null || line.length() < 3) return null;

        Code   x    = Code.fromChar(line.charAt(0));
        Code   y    = Code.fromChar(line.charAt(1));
        String rest = line.substring(3);

        String path;
        String origPath = null;
        if (rest.contains(" -> ")) {
            String[] parts = rest.split(" -> ", 2);
            origPath = unquote(parts[0].trim());
            path     = unquote(parts[1].trim());
        } else {
            path = unquote(rest.trim());
        }
        return new FileStatus(path, origPath, x, y);
    }

    private static String unquote(String s) {
        if (s.startsWith("\"") && s.endsWith("\"")) {
            return s.substring(1, s.length() - 1);
        }
        return s;
    }

    @Override
    public String toString() {
        return x.staged + "" + y.unstaged + "  " + path;
    }
}

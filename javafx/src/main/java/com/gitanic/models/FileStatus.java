package com.gitanic.models;

/**
 * Represents one line of `git status --porcelain` output.
 * Column layout: XY PATH  or  XY ORIG -> PATH  (renames)
 */
public class FileStatus {

    public enum Code {
        MODIFIED(' ', 'M'),
        ADDED(   'A', 'A'),
        DELETED( 'D', 'D'),
        RENAMED( 'R', 'R'),
        COPIED(  'C', 'C'),
        UNTRACKED('?', '?'),
        IGNORED(  '!', '!'),
        UNMERGED( 'U', 'U'),
        NONE(     ' ', ' ');

        public final char staged;
        public final char unstaged;

        Code(char staged, char unstaged) {
            this.staged   = staged;
            this.unstaged = unstaged;
        }

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

    public FileStatus(String path, String origPath, Code x, Code y) {
        this.path     = path;
        this.origPath = origPath;
        this.x        = x;
        this.y        = y;
    }

    // ---- Getters -------------------------------------------------------

    public String getPath()     { return path; }
    public String getOrigPath() { return origPath; }
    public Code   getX()        { return x; }
    public Code   getY()        { return y; }

    /** True if this file has staged changes (shows in Staged panel). */
    public boolean isStaged() {
        return x != Code.NONE && x != Code.UNTRACKED;
    }

    /** True if this file has unstaged or untracked changes (shows in Changes panel). */
    public boolean isUnstaged() {
        boolean untracked = x == Code.UNTRACKED && y == Code.UNTRACKED;
        return untracked || (y != Code.NONE && y != Code.IGNORED);
    }

    /** Display string for the staged list cell. */
    public String getStagedLabel() {
        return x.staged + "  " + shortName();
    }

    /** Display string for the unstaged/changes list cell. */
    public String getUnstagedLabel() {
        char code = (x == Code.UNTRACKED) ? '?' : y.unstaged;
        return code + "  " + shortName();
    }

    private String shortName() {
        int slash = path.lastIndexOf('/');
        int back  = path.lastIndexOf('\\');
        int sep   = Math.max(slash, back);
        return sep >= 0 ? path.substring(sep + 1) : path;
    }

    // ---- Factory -------------------------------------------------------

    /**
     * Parses one porcelain line. Returns null for empty lines.
     */
    public static FileStatus parse(String line) {
        if (line == null || line.length() < 3) return null;

        Code x    = Code.fromChar(line.charAt(0));
        Code y    = Code.fromChar(line.charAt(1));
        String rest = line.substring(3);

        String path, origPath = null;
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

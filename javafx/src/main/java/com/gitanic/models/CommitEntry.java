package com.gitanic.models;

/**
 * Represents one commit from
 * {@code git log --pretty=format:"%H|%an|%ae|%ad|%s" --date=short}.
 *
 * <p>Instances are immutable.  Use {@link #parse(String)} to create them from
 * a porcelain log line.
 */
public class CommitEntry {

    private final String hash;
    private final String shortHash;
    private final String authorName;
    private final String authorEmail;
    private final String date;
    private final String subject;

    /**
     * Constructs a {@link CommitEntry}.
     *
     * @param hash        full 40-character SHA-1 hash (or partial)
     * @param authorName  author display name
     * @param authorEmail author email address
     * @param date        ISO-8601 short date (e.g. {@code 2026-04-07})
     * @param subject     first line of the commit message
     */
    public CommitEntry(String hash, String authorName, String authorEmail,
                       String date, String subject) {
        this.hash        = hash        != null ? hash.trim()        : "";
        this.shortHash   = this.hash.length() >= 7 ? this.hash.substring(0, 7) : this.hash;
        this.authorName  = authorName  != null ? authorName.trim()  : "";
        this.authorEmail = authorEmail != null ? authorEmail.trim() : "";
        this.date        = date        != null ? date.trim()        : "";
        this.subject     = subject     != null ? subject.trim()     : "";
    }

    // ---- Getters -------------------------------------------------------

    /** Returns the full commit hash. */
    public String getHash()        { return hash; }
    /** Returns the first 7 characters of the hash. */
    public String getShortHash()   { return shortHash; }
    /** Returns the author's display name. */
    public String getAuthorName()  { return authorName; }
    /** Returns the author's email address. */
    public String getAuthorEmail() { return authorEmail; }
    /** Returns the commit date in ISO-8601 short format. */
    public String getDate()        { return date; }
    /** Returns the first line of the commit message. */
    public String getSubject()     { return subject; }

    // ---- Factory -------------------------------------------------------

    /**
     * Parses a pipe-delimited log line in the format:
     * {@code hash|authorName|authorEmail|date|subject}.
     *
     * @param logLine one line from the formatted git log output
     * @return the parsed entry, or {@code null} for blank/null input
     */
    public static CommitEntry parse(String logLine) {
        if (logLine == null || logLine.isBlank()) return null;
        String[] p = logLine.split("\\|", 5);
        return new CommitEntry(
            p.length > 0 ? p[0] : "",
            p.length > 1 ? p[1] : "",
            p.length > 2 ? p[2] : "",
            p.length > 3 ? p[3] : "",
            p.length > 4 ? p[4] : ""
        );
    }

    @Override
    public String toString() {
        return shortHash + "  " + subject + "  \u00B7  " + authorName + "  " + date;
    }
}

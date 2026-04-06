package com.gitanic.models;

/**
 * Represents one commit from `git log --pretty=format:"%H|%an|%ae|%ad|%s" --date=short`
 */
public class CommitEntry {

    private final String hash;
    private final String shortHash;
    private final String authorName;
    private final String authorEmail;
    private final String date;
    private final String subject;

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

    public String getHash()        { return hash; }
    public String getShortHash()   { return shortHash; }
    public String getAuthorName()  { return authorName; }
    public String getAuthorEmail() { return authorEmail; }
    public String getDate()        { return date; }
    public String getSubject()     { return subject; }

    // ---- Factory -------------------------------------------------------

    /**
     * Parse a pipe-delimited log line: hash|authorName|authorEmail|date|subject
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
        return shortHash + "  " + subject + "  ·  " + authorName + "  " + date;
    }
}

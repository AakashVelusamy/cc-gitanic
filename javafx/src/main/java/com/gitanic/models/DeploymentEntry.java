package com.gitanic.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Represents one deployment record from the deployment history.
 *
 * <p>Deserialized from the {@code /api/repos/:name/deployments} API response.
 * Status values: {@code pending}, {@code building}, {@code success}, {@code failed}.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class DeploymentEntry {

    private String id;

    @JsonProperty("repo_id")
    private String repoId;

    @JsonProperty("user_id")
    private String userId;

    private String status;           // pending | building | success | failed

    @JsonProperty("commit_sha")
    private String commitSha;

    @JsonProperty("commit_message")
    private String commitMessage;

    @JsonProperty("storage_path")
    private String storagePath;

    @JsonProperty("duration_ms")
    private Integer durationMs;

    @JsonProperty("created_at")
    private String createdAt;

    // ---- Getters / setters ----------------------------------------

    public String  getId()                        { return id; }
    public void    setId(String id)               { this.id = id; }

    public String  getRepoId()                    { return repoId; }
    public void    setRepoId(String v)            { this.repoId = v; }

    public String  getUserId()                    { return userId; }
    public void    setUserId(String v)            { this.userId = v; }

    public String  getStatus()                    { return status; }
    public void    setStatus(String v)            { this.status = v; }

    public String  getCommitSha()                 { return commitSha; }
    public void    setCommitSha(String v)         { this.commitSha = v; }

    public String  getCommitMessage()             { return commitMessage; }
    public void    setCommitMessage(String v)     { this.commitMessage = v; }

    public String  getStoragePath()               { return storagePath; }
    public void    setStoragePath(String v)       { this.storagePath = v; }

    public Integer getDurationMs()                { return durationMs; }
    public void    setDurationMs(Integer v)       { this.durationMs = v; }

    public String  getCreatedAt()                 { return createdAt; }
    public void    setCreatedAt(String v)         { this.createdAt = v; }

    // ---- Helpers ---------------------------------------------------

    public String getShortHash() {
        if (commitSha == null) return "unknown";
        return commitSha.length() >= 7 ? commitSha.substring(0, 7) : commitSha;
    }

    public String getShortMessage() {
        if (commitMessage == null || commitMessage.isBlank()) return "(no message)";
        return commitMessage.length() > 60
                ? commitMessage.substring(0, 57) + "…"
                : commitMessage;
    }

    public String getShortDate() {
        if (createdAt == null) return "";
        return createdAt.length() >= 10 ? createdAt.substring(0, 10) : createdAt;
    }

    public String getDurationLabel() {
        if (durationMs == null) return "";
        long s = durationMs / 1000;
        return s < 60 ? s + "s" : (s / 60) + "m " + (s % 60) + "s";
    }

    public boolean isInProgress() {
        return "pending".equalsIgnoreCase(status) || "building".equalsIgnoreCase(status);
    }

    public boolean isSuccess() { return "success".equalsIgnoreCase(status); }
    public boolean isFailed()  { return "failed".equalsIgnoreCase(status); }

    @Override
    public String toString() {
        String icon = statusIcon();
        return icon + "  " + getShortHash() + "  " + getShortMessage()
             + "   " + getShortDate()
             + (getDurationLabel().isBlank() ? "" : "  (" + getDurationLabel() + ")");
    }

    private String statusIcon() {
        if (status == null) return "○";
        return switch (status.toLowerCase()) {
            case "success"  -> "✓";
            case "failed"   -> "✗";
            case "building" -> "⟳";
            default         -> "○";
        };
    }
}

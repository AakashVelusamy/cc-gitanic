package com.gitanic.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import com.gitanic.AppState;

/**
 * Represents a Gitanic repository as returned by the REST API.
 *
 * <p>Deserialized from {@code /api/repos} and {@code /api/repos/:name}
 * responses.  The {@link #getGitUrl()} helper derives the clone URL from the
 * current {@link AppState} so it always reflects the configured git host.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class Repository {

    private String  id;
    private String  name;
    private String  owner;      // owner username (may be populated from API)

    @JsonProperty("auto_deploy_enabled")
    private boolean autoDeployEnabled;

    @JsonProperty("active_deployment_id")
    private String activeDeploymentId;

    @JsonProperty("created_at")
    private String createdAt;

    public Repository() {}

    // ---- Getters / Setters --------------------------------------------

    public String  getId()                        { return id; }
    public void    setId(String id)               { this.id = id; }

    public String  getName()                      { return name; }
    public void    setName(String name)           { this.name = name; }

    public String  getOwner()                     { return owner; }
    public void    setOwner(String owner)         { this.owner = owner; }

    public boolean isAutoDeployEnabled()          { return autoDeployEnabled; }
    public void    setAutoDeployEnabled(boolean v){ this.autoDeployEnabled = v; }

    public String  getActiveDeploymentId()           { return activeDeploymentId; }
    public void    setActiveDeploymentId(String v)   { this.activeDeploymentId = v; }

    public String  getCreatedAt()                    { return createdAt; }
    public void    setCreatedAt(String v)            { this.createdAt = v; }

    public boolean hasActiveDeployment()             { return activeDeploymentId != null && !activeDeploymentId.isBlank(); }

    // ---- Helpers -------------------------------------------------------

    /**
     * Returns the .git clone URL for this repo.
     * Uses the logged-in username as owner if owner field is not set.
     */
    public String getGitUrl() {
        AppState state    = AppState.getInstance();
        String   gitBase  = state.getGitBaseUrl();
        String   ownerStr = (owner != null && !owner.isBlank())
                ? owner
                : (state.getCurrentUser() != null ? state.getCurrentUser().getUsername() : "");
        return gitBase + "/" + ownerStr + "/" + name + ".git";
    }

    @Override
    public String toString() {
        return name != null ? name : "";
    }
}

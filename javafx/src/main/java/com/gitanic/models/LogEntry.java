package com.gitanic.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public class LogEntry {

    private String id;

    @JsonProperty("deployment_id")
    private String deploymentId;

    private String text;

    @JsonProperty("log_text")
    private String logText;          // some API versions use this key

    @JsonProperty("created_at")
    private String createdAt;

    // ---- Getters / setters ----------------------------------------

    public String getId()               { return id; }
    public void   setId(String id)      { this.id = id; }

    public String getDeploymentId()          { return deploymentId; }
    public void   setDeploymentId(String v)  { this.deploymentId = v; }

    public String getText()             { return text != null ? text : (logText != null ? logText : ""); }
    public void   setText(String v)     { this.text = v; }
    public void   setLogText(String v)  { this.logText = v; }

    public String getCreatedAt()        { return createdAt; }
    public void   setCreatedAt(String v){ this.createdAt = v; }
}

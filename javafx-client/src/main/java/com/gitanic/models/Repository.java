package com.gitanic.models;

public class Repository {
    private String id;
    private String name;
    private boolean autoDeployEnabled;

    public Repository() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public boolean isAutoDeployEnabled() { return autoDeployEnabled; }
    public void setAutoDeployEnabled(boolean autoDeployEnabled) { this.autoDeployEnabled = autoDeployEnabled; }

    @Override
    public String toString() {
        return name;
    }
}

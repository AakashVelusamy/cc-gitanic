package com.gitanic;

import com.gitanic.models.Repository;
import com.gitanic.models.User;

import java.io.File;
import java.util.prefs.Preferences;

/**
 * Singleton holding all runtime application state.
 * Replaces scattered static fields on controllers.
 * Pattern: Singleton
 */
public final class AppState {

    private static AppState instance;

    // --- Auth / Network ---
    private String apiBaseUrl  = "http://localhost:3000/api";
    private String gitBaseUrl  = "http://localhost:3000/git";
    private User   currentUser;
    private String password;        // kept in-memory for git HTTP Basic Auth

    // --- Workspace ---
    private Repository selectedRepo;
    private File       currentRepoDir;
    private String     currentBranch  = "main";

    // Transient: a custom clone URL the user pasted manually
    private String     overrideCloneUrl;

    private AppState() {}

    public static synchronized AppState getInstance() {
        if (instance == null) {
            instance = new AppState();
        }
        return instance;
    }

    // ---- Auth / Network ------------------------------------------------

    public String getApiBaseUrl()            { return apiBaseUrl; }
    public void   setApiBaseUrl(String url)  {
        this.apiBaseUrl = url.replaceAll("/+$", "");
        // Derive gitBaseUrl: replace trailing "/api" with "/git"
        this.gitBaseUrl = this.apiBaseUrl.replaceAll("/api$", "") + "/git";
    }

    public String getGitBaseUrl()             { return gitBaseUrl; }

    public User   getCurrentUser()            { return currentUser; }
    public void   setCurrentUser(User u)      { this.currentUser = u; }

    public String getPassword()               { return password; }
    public void   setPassword(String p)       { this.password = p; }

    public boolean isLoggedIn()               { return currentUser != null; }

    // ---- Workspace ----------------------------------------------------

    public Repository getSelectedRepo()             { return selectedRepo; }
    public void       setSelectedRepo(Repository r) { this.selectedRepo = r; }

    public File   getCurrentRepoDir()               { return currentRepoDir; }
    public void   setCurrentRepoDir(File d)         { this.currentRepoDir = d; }

    public String getCurrentBranch()                { return currentBranch; }
    public void   setCurrentBranch(String b)        { this.currentBranch = b; }

    public String getOverrideCloneUrl()             { return overrideCloneUrl; }
    public void   setOverrideCloneUrl(String url)   { this.overrideCloneUrl = url; }

    // ---- Helpers -------------------------------------------------------

    /**
     * Build an authenticated git URL for remote operations.
     * Format: https://username:password@host/git/owner/repo.git
     * Upgrades http:// to https:// for non-localhost hosts to avoid
     * redirect-induced credential stripping by git.
     */
    public String buildAuthUrl(String ownerUsername, String repoName) {
        String user = currentUser != null ? currentUser.getUsername() : ownerUsername;
        String pass = password != null ? encodeCredential(password) : "";
        int schemeEnd = gitBaseUrl.indexOf("://") + 3;
        String scheme   = gitBaseUrl.substring(0, schemeEnd);
        String hostRest = gitBaseUrl.substring(schemeEnd);
        scheme = upgradeScheme(scheme, hostRest);
        return scheme + user + ":" + pass + "@" + hostRest + "/" + ownerUsername + "/" + repoName + ".git";
    }

    /**
     * Build authenticated URL from a raw git URL (e.g. pasted by user).
     * If URL already contains @, return as-is. Otherwise inject credentials.
     * Upgrades http:// to https:// for non-localhost hosts to avoid
     * redirect-induced credential stripping by git.
     */
    public String injectCredentials(String rawUrl) {
        if (rawUrl == null || rawUrl.contains("@")) return rawUrl;
        if (currentUser == null || password == null) return rawUrl;
        int schemeEnd = rawUrl.indexOf("://");
        if (schemeEnd < 0) return rawUrl;
        String scheme = rawUrl.substring(0, schemeEnd + 3);
        String rest   = rawUrl.substring(schemeEnd + 3);
        String user   = encodeCredential(currentUser.getUsername());
        String pass   = encodeCredential(password);
        scheme = upgradeScheme(scheme, rest);
        return scheme + user + ":" + pass + "@" + rest;
    }

    /**
     * Upgrades http:// to https:// unless the host is localhost or 127.0.0.1.
     * Git strips Authorization headers when following HTTP→HTTPS redirects,
     * so we must use the correct scheme from the start.
     */
    private String upgradeScheme(String scheme, String hostAndRest) {
        if (!"http://".equals(scheme)) return scheme;
        String host = hostAndRest.split("[/:?#]")[0];
        if ("localhost".equals(host) || "127.0.0.1".equals(host)) return scheme;
        return "https://";
    }

    private String encodeCredential(String s) {
        return s.replace("%", "%25").replace("@", "%40").replace(":", "%3A").replace(" ", "%20");
    }

    // ---- Session persistence ------------------------------------------

    private static final String SESSION_NODE = "com/gitanic/session";

    /**
     * Persists current user + credentials to OS keystore (java.util.prefs).
     * Called after every successful login so the app can auto-restore.
     */
    public void saveSession() {
        Preferences prefs = Preferences.userRoot().node(SESSION_NODE);
        if (currentUser != null) {
            prefs.put("username", currentUser.getUsername());
            prefs.put("token",    currentUser.getToken() != null ? currentUser.getToken() : "");
            prefs.put("password", password != null ? password : "");
            prefs.put("apiUrl",   apiBaseUrl);
        }
    }

    /**
     * Restores a previously saved session into AppState.
     * Returns true if a valid session was found (username + token present).
     * App.start() calls this to decide the startup screen.
     */
    public boolean restoreSession() {
        Preferences prefs = Preferences.userRoot().node(SESSION_NODE);
        String username = prefs.get("username", "");
        String token    = prefs.get("token",    "");
        String pwd      = prefs.get("password", "");
        String apiUrl   = prefs.get("apiUrl",   "http://localhost:3000/api");
        if (username.isEmpty() || token.isEmpty()) return false;
        setApiBaseUrl(apiUrl);
        currentUser = new User(username, token);
        password    = pwd.isEmpty() ? null : pwd;
        return true;
    }

    /** Removes all saved session data. Called from logout(). */
    public void clearSavedSession() {
        try {
            Preferences.userRoot().node(SESSION_NODE).removeNode();
        } catch (Exception ignored) {}
    }

    public void logout() {
        clearSavedSession();
        currentUser    = null;
        password       = null;
        selectedRepo   = null;
        currentRepoDir = null;
        currentBranch  = "main";
        overrideCloneUrl = null;
    }
}

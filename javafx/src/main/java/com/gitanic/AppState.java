package com.gitanic;

import com.gitanic.models.Repository;
import com.gitanic.models.User;

import java.io.File;
import java.util.Arrays;
import java.util.logging.Logger;
import java.util.prefs.BackingStoreException;
import java.util.prefs.Preferences;
import java.util.regex.Pattern;

/**
 * Singleton holding all runtime application state.
 * Replaces scattered static fields on controllers.
 *
 * <p>Pattern: Singleton (holder pattern — thread-safe without synchronised).
 *
 * <p>Security notes:
 * <ul>
 *   <li>The password is stored as a {@code char[]} internally and can be
 *       zeroed via {@link #clearCredentials()}.  Note that JavaFX
 *       {@code PasswordField} uses {@link String} internally, so the password
 *       will briefly exist as a {@link String} on the JVM heap before being
 *       converted here — this is a best-effort mitigation only.</li>
 *   <li>Passwords and tokens are never passed to any logger.</li>
 *   <li>For non-localhost API base URLs the scheme must be {@code https://}.</li>
 * </ul>
 */
public final class AppState {

    private static final Logger LOG = Logger.getLogger(AppState.class.getName());

    /** Pattern for valid HTTPS base URLs (or http for localhost). */
    private static final Pattern HTTPS_PATTERN =
            Pattern.compile("^https://.*", Pattern.CASE_INSENSITIVE);
    private static final Pattern LOCAL_HTTP_PATTERN =
            Pattern.compile("^http://(localhost|127\\.0\\.0\\.1)(:\\d+)?(/.*)?$",
                    Pattern.CASE_INSENSITIVE);

    // ------------------------------------------------------------------ singleton

    /** Holder-pattern singleton — thread-safe without synchronised. */
    private static final class Holder {
        static final AppState INSTANCE = new AppState();
    }

    private AppState() {}

    /** Returns the singleton instance. */
    public static AppState getInstance() {
        return Holder.INSTANCE;
    }

    // ---- Auth / Network ---

    private String apiBaseUrl = "https://gitanic.up.railway.app/api";
    private String gitBaseUrl = "https://gitanic.up.railway.app/git";
    private User   currentUser;

    /**
     * Password stored as {@code char[]} so it can be explicitly zeroed.
     * Best-effort: the JVM may still hold copies on the heap from
     * intermediate String allocations in JavaFX input fields.
     */
    private char[] password;

    // ---- Workspace ---

    private Repository selectedRepo;
    private File       currentRepoDir;
    private String     currentBranch = "main";

    /** Transient: a custom clone URL the user pasted manually. */
    private String overrideCloneUrl;

    // ---- Auth / Network ------------------------------------------------

    /**
     * Returns the API base URL (never null; always trailing-slash-free).
     *
     * @return the API base URL string
     */
    public String getApiBaseUrl() {
        return apiBaseUrl;
    }

    /**
     * Sets the API base URL, stripping any trailing slashes.
     * Also derives the git base URL from this value.
     *
     * <p>For non-localhost hosts, the URL must use {@code https://}.
     *
     * @param url the new API base URL
     * @throws SecurityException if the URL is http:// for a non-localhost host
     */
    public void setApiBaseUrl(String url) {
        String trimmed = url.replaceAll("/+$", "");
        validateUrl(trimmed);
        this.apiBaseUrl = trimmed;
        // Derive gitBaseUrl: replace trailing "/api" with "/git"
        this.gitBaseUrl = this.apiBaseUrl.replaceAll("/api$", "") + "/git";
    }

    /**
     * Returns the git base URL (derived from {@link #apiBaseUrl}).
     *
     * @return the git base URL string
     */
    public String getGitBaseUrl() {
        return gitBaseUrl;
    }

    /**
     * Returns the currently authenticated user, or {@code null} if not logged in.
     *
     * @return the current {@link User}
     */
    public User getCurrentUser() {
        return currentUser;
    }

    /**
     * Sets the currently authenticated user.
     *
     * @param u the {@link User} to set
     */
    public void setCurrentUser(User u) {
        this.currentUser = u;
    }

    /**
     * Returns the stored password as a plain {@link String}.
     *
     * <p><strong>Note:</strong> This method exists because git HTTP Basic Auth
     * requires the password as a String embedded in a URL.  Avoid logging or
     * persisting the return value.
     *
     * @return the password, or {@code null} if not set
     */
    public String getPassword() {
        return password != null ? new String(password) : null;
    }

    /**
     * Stores the password as a {@code char[]} copy.
     * The caller's String is not modified — this is best-effort protection.
     *
     * @param p the password to store (may be {@code null} to clear)
     */
    public void setPassword(String p) {
        // Zero any previous password first
        if (this.password != null) {
            Arrays.fill(this.password, '\0');
        }
        this.password = (p != null) ? p.toCharArray() : null;
    }

    /**
     * Returns whether the user is currently logged in.
     *
     * @return {@code true} if a current user is set
     */
    public boolean isLoggedIn() {
        return currentUser != null;
    }

    // ---- Workspace ----------------------------------------------------

    /**
     * Returns the currently selected remote {@link Repository}.
     *
     * @return the selected repository, or {@code null}
     */
    public Repository getSelectedRepo() {
        return selectedRepo;
    }

    /**
     * Sets the currently selected remote {@link Repository}.
     *
     * @param r the repository to set
     */
    public void setSelectedRepo(Repository r) {
        this.selectedRepo = r;
    }

    /**
     * Returns the current local repository directory.
     *
     * @return the directory {@link File}, or {@code null}
     */
    public File getCurrentRepoDir() {
        return currentRepoDir;
    }

    /**
     * Sets the current local repository directory.
     *
     * @param d the directory to set
     */
    public void setCurrentRepoDir(File d) {
        this.currentRepoDir = d;
    }

    /**
     * Returns the current branch name.
     *
     * @return the branch name (default: "main")
     */
    public String getCurrentBranch() {
        return currentBranch;
    }

    /**
     * Sets the current branch name.
     *
     * @param b the branch name
     */
    public void setCurrentBranch(String b) {
        this.currentBranch = b;
    }

    /**
     * Returns the transient override clone URL (pasted by the user).
     *
     * @return the override URL, or {@code null}
     */
    public String getOverrideCloneUrl() {
        return overrideCloneUrl;
    }

    /**
     * Sets a transient override clone URL.
     *
     * @param url the URL to set, or {@code null} to clear
     */
    public void setOverrideCloneUrl(String url) {
        this.overrideCloneUrl = url;
    }

    // ---- Helpers -------------------------------------------------------

    /**
     * Builds an authenticated git URL for remote operations.
     * Format: {@code https://username:password@host/git/owner/repo.git}.
     * Upgrades {@code http://} to {@code https://} for non-localhost hosts to
     * avoid redirect-induced credential stripping by git.
     *
     * @param ownerUsername the repository owner's username
     * @param repoName      the repository name
     * @return the authenticated URL string
     */
    public String buildAuthUrl(String ownerUsername, String repoName) {
        String user = currentUser != null ? currentUser.getUsername() : ownerUsername;
        String pass = password != null ? encodeCredential(new String(password)) : "";
        int schemeEnd = gitBaseUrl.indexOf("://") + 3;
        String scheme   = gitBaseUrl.substring(0, schemeEnd);
        String hostRest = gitBaseUrl.substring(schemeEnd);
        scheme = upgradeScheme(scheme, hostRest);
        return scheme + user + ":" + pass + "@" + hostRest + "/" + ownerUsername + "/" + repoName + ".git";
    }

    /**
     * Builds an authenticated URL from a raw git URL (e.g. pasted by user).
     * If the URL already contains {@code @}, it is returned as-is.
     * Otherwise credentials are injected.
     * Upgrades {@code http://} to {@code https://} for non-localhost hosts.
     *
     * @param rawUrl the raw git URL
     * @return the authenticated URL, or the original URL if credentials are unavailable
     */
    public String injectCredentials(String rawUrl) {
        if (rawUrl == null || rawUrl.contains("@")) return rawUrl;
        if (currentUser == null || password == null) return rawUrl;
        int schemeEnd = rawUrl.indexOf("://");
        if (schemeEnd < 0) return rawUrl;
        String scheme = rawUrl.substring(0, schemeEnd + 3);
        String rest   = rawUrl.substring(schemeEnd + 3);
        String user   = encodeCredential(currentUser.getUsername());
        String pass   = encodeCredential(new String(password));
        scheme = upgradeScheme(scheme, rest);
        return scheme + user + ":" + pass + "@" + rest;
    }

    /**
     * Upgrades {@code http://} to {@code https://} unless the host is
     * {@code localhost} or {@code 127.0.0.1}.
     * Git strips Authorization headers when following HTTP→HTTPS redirects,
     * so we must use the correct scheme from the start.
     *
     * @param scheme      the current URL scheme (e.g. "http://")
     * @param hostAndRest the remainder of the URL after the scheme
     * @return the (potentially upgraded) scheme
     */
    private static String upgradeScheme(String scheme, String hostAndRest) {
        if (!"http://".equals(scheme)) return scheme;
        String host = hostAndRest.split("[/:?#]")[0];
        if ("localhost".equals(host) || "127.0.0.1".equals(host)) return scheme;
        return "https://";
    }

    /**
     * Percent-encodes characters that have special meaning inside a URL authority.
     *
     * @param s the credential component to encode
     * @return the encoded string
     */
    private static String encodeCredential(String s) {
        return s.replace("%", "%25")
                .replace("@", "%40")
                .replace(":", "%3A")
                .replace(" ", "%20");
    }

    /**
     * Validates that the given URL is safe to use as the API base URL.
     * Throws {@link SecurityException} if the URL is HTTP for a non-localhost host.
     *
     * @param url the URL to validate
     */
    private static void validateUrl(String url) {
        if (url == null || url.isBlank()) return; // allow blank during init
        boolean isHttps = HTTPS_PATTERN.matcher(url).matches();
        boolean isLocalHttp = LOCAL_HTTP_PATTERN.matcher(url).matches();
        if (!isHttps && !isLocalHttp && url.startsWith("http://")) {
            throw new SecurityException(
                    "API base URL must use HTTPS for non-localhost hosts: " + url);
        }
    }

    // ---- Credentials management ---------------------------------------

    /**
     * Zeros the in-memory password buffer and clears the current user reference.
     * Call this on logout or whenever credentials should be discarded.
     *
     * <p>Note: this is best-effort — the JVM may retain copies of the password
     * {@link String} in the heap from earlier assignments.
     */
    public void clearCredentials() {
        if (password != null) {
            Arrays.fill(password, '\0');
            password = null;
        }
        currentUser = null;
    }

    // ---- Session persistence ------------------------------------------

    private static final String SESSION_NODE = "com/gitanic/session";

    /**
     * Persists current user and credentials to the OS keystore via
     * {@link java.util.prefs.Preferences}.
     * Called after every successful login so the app can auto-restore.
     */
    public void saveSession() {
        Preferences prefs = Preferences.userRoot().node(SESSION_NODE);
        if (currentUser != null) {
            prefs.put("username", currentUser.getUsername());
            prefs.put("token",    currentUser.getToken() != null ? currentUser.getToken() : "");
            // NOTE: password stored in OS-managed Preferences store (not a plain log)
            prefs.put("password", password != null ? new String(password) : "");
            prefs.put("apiUrl",   apiBaseUrl);
        }
    }

    /**
     * Restores a previously saved session into AppState.
     * Returns {@code true} if a valid session was found (username + token present).
     * {@link App#start} calls this to decide the startup screen.
     *
     * @return {@code true} if a valid session was restored
     */
    public boolean restoreSession() {
        Preferences prefs = Preferences.userRoot().node(SESSION_NODE);
        String username = prefs.get("username", "");
        String token    = prefs.get("token",    "");
        String pwd      = prefs.get("password", "");
        String apiUrl   = prefs.get("apiUrl",   "https://gitanic.up.railway.app/api");
        if (username.isEmpty() || token.isEmpty()) return false;
        setApiBaseUrl(apiUrl);
        currentUser = new User(username, token);
        setPassword(pwd.isEmpty() ? null : pwd);
        return true;
    }

    /**
     * Removes all saved session data.  Called from {@link #logout()}.
     */
    public void clearSavedSession() {
        try {
            Preferences.userRoot().node(SESSION_NODE).removeNode();
        } catch (BackingStoreException ignored) {
            // Non-fatal — preferences may not be persisted yet
        }
    }

    /**
     * Logs the user out: clears saved session, zeroes credentials, resets state.
     */
    public void logout() {
        clearSavedSession();
        clearCredentials();   // zeros password char[] and nulls currentUser
        selectedRepo     = null;
        currentRepoDir   = null;
        currentBranch    = "main";
        overrideCloneUrl = null;
    }
}

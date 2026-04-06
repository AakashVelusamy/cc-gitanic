package com.gitanic.services;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gitanic.AppState;
import com.gitanic.models.DeploymentEntry;
import com.gitanic.models.LogEntry;
import com.gitanic.models.Repository;
import com.gitanic.models.User;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;
import java.util.regex.Pattern;

/**
 * Repository-pattern service for all Gitanic REST API calls.
 *
 * <p>Pattern: Singleton + Repository.  All methods are synchronous — callers
 * must invoke them on background threads.
 *
 * <p>Security notes:
 * <ul>
 *   <li>Passwords and JWT tokens are never written to any log.</li>
 *   <li>All path segments built from user input are encoded with
 *       {@link URLEncoder#encode} before being appended to the base URL.</li>
 *   <li>For non-localhost API base URLs the scheme is required to be
 *       {@code https://} to prevent plaintext transmission of credentials.</li>
 * </ul>
 */
public final class NetworkService {

    private static final Logger LOG = Logger.getLogger(NetworkService.class.getName());

    /** Matches a valid HTTPS URL (or http for localhost/127.0.0.1 only). */
    private static final Pattern HTTPS_PATTERN =
            Pattern.compile("^https://.*", Pattern.CASE_INSENSITIVE);
    private static final Pattern LOCAL_HTTP_PATTERN =
            Pattern.compile("^http://(localhost|127\\.0\\.0\\.1)(:\\d+)?(/.*)?$",
                    Pattern.CASE_INSENSITIVE);

    // ------------------------------------------------------------------ singleton

    /** Holder-pattern singleton — thread-safe without synchronised. */
    private static final class Holder {
        static final NetworkService INSTANCE = new NetworkService();
    }

    private NetworkService() {}

    /** Returns the singleton instance. */
    public static NetworkService getInstance() {
        return Holder.INSTANCE;
    }

    // ------------------------------------------------------------------ state

    private final HttpClient   httpClient = HttpClient.newHttpClient();
    private final ObjectMapper mapper     = new ObjectMapper();

    // ====================================================================
    //  Auth
    // ====================================================================

    /**
     * Authenticates the user and stores the returned JWT in {@link AppState}.
     *
     * <p>The password is transmitted over the wire but is <strong>never</strong>
     * written to any log.
     *
     * @param username the account username
     * @param password the account password (not logged)
     * @return the authenticated {@link User}
     * @throws Exception if authentication fails or the network is unavailable
     */
    public User login(String username, String password) throws Exception {
        validateApiBaseUrl(AppState.getInstance().getApiBaseUrl());

        // NOTE: password is intentionally not logged anywhere in this method
        String body = mapper.writeValueAsString(Map.of("username", username, "password", password));

        HttpResponse<String> res = httpClient.send(
                post("/auth/login", body, false),
                HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200) {
            JsonNode json  = mapper.readTree(res.body());
            String   token = json.has("token") ? json.get("token").asText() : null;
            if (token == null) throw new Exception("Server returned no token.");
            User user = new User(username, token);
            AppState state = AppState.getInstance();
            state.setCurrentUser(user);
            state.setPassword(password);
            state.saveSession();
            return user;
        }
        throw new Exception(extractMessage(res.body(), "Login failed (" + res.statusCode() + ")"));
    }

    /**
     * Registers a new account and auto-logs in on success.
     *
     * @param username the desired username
     * @param password the desired password (not logged)
     * @return the authenticated {@link User}
     * @throws Exception if registration fails or the network is unavailable
     */
    public User register(String username, String password) throws Exception {
        validateApiBaseUrl(AppState.getInstance().getApiBaseUrl());

        // NOTE: password is intentionally not logged anywhere in this method
        String body = mapper.writeValueAsString(Map.of("username", username, "password", password));

        HttpResponse<String> res = httpClient.send(
                post("/auth/register", body, false),
                HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200 || res.statusCode() == 201) {
            return login(username, password);   // auto-login after register
        }
        throw new Exception(extractMessage(res.body(), "Registration failed (" + res.statusCode() + ")"));
    }

    // ====================================================================
    //  Repositories
    // ====================================================================

    /**
     * Fetches all repositories owned by the current user.
     *
     * @return list of {@link Repository} objects
     * @throws Exception on network or authentication failure
     */
    public List<Repository> getRepositories() throws Exception {
        HttpResponse<String> res = httpClient.send(
                get("/repos"), HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200) {
            String bodyStr = res.body().trim();
            if (bodyStr.startsWith("[")) {
                return mapper.readValue(bodyStr, new TypeReference<List<Repository>>() {});
            }
            JsonNode root = mapper.readTree(bodyStr);
            JsonNode arr  = root.isArray()          ? root
                          : root.has("repos")       ? root.get("repos")
                          : root.has("data")        ? root.get("data")
                          : root;
            return mapper.convertValue(arr, new TypeReference<List<Repository>>() {});
        }
        throw new Exception(extractMessage(res.body(), "Failed to load repositories"));
    }

    /**
     * Creates a new repository.
     *
     * @param name the repository name (alphanumeric, hyphens, underscores)
     * @return the created {@link Repository}
     * @throws Exception on network or authentication failure
     */
    public Repository createRepository(String name) throws Exception {
        String body = mapper.writeValueAsString(Map.of("name", name));
        HttpResponse<String> res = httpClient.send(
                post("/repos", body, true),
                HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200 || res.statusCode() == 201) {
            JsonNode json     = mapper.readTree(res.body());
            JsonNode repoNode = json.has("repo") ? json.get("repo") : json;
            return mapper.treeToValue(repoNode, Repository.class);
        }
        throw new Exception(extractMessage(res.body(), "Failed to create repository"));
    }

    /**
     * Deletes a repository by name.
     *
     * @param repoName the repository name (URL-encoded before use)
     * @throws Exception on network or authentication failure
     */
    public void deleteRepository(String repoName) throws Exception {
        String encodedName = URLEncoder.encode(repoName, StandardCharsets.UTF_8);
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl("/repos/" + encodedName)))
                .header("Authorization", "Bearer " + token())
                .DELETE()
                .build();

        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() != 200 && res.statusCode() != 204) {
            throw new Exception(extractMessage(res.body(), "Failed to delete repository"));
        }
    }

    // ====================================================================
    //  Deployments
    // ====================================================================

    /**
     * Triggers a deployment for the given repository.
     *
     * @param repoName the repository name (URL-encoded before use)
     * @return the deployment ID or "queued"
     * @throws Exception on network or authentication failure
     */
    public String triggerDeploy(String repoName) throws Exception {
        String encodedName = URLEncoder.encode(repoName, StandardCharsets.UTF_8);
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl("/repos/" + encodedName + "/deploy")))
                .header("Authorization", "Bearer " + token())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.noBody())
                .build();

        HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200 || res.statusCode() == 202) {
            JsonNode json = mapper.readTree(res.body());
            return json.has("deploymentId") ? json.get("deploymentId").asText()
                 : json.has("id")           ? json.get("id").asText()
                 : "queued";
        }
        throw new Exception(extractMessage(res.body(), "Deploy failed (" + res.statusCode() + ")"));
    }

    /**
     * Fetches the deployment history for the given repository.
     *
     * @param repoName the repository name (URL-encoded before use)
     * @return list of {@link DeploymentEntry} objects
     * @throws Exception on network or authentication failure
     */
    public List<DeploymentEntry> getDeployments(String repoName) throws Exception {
        String encodedName = URLEncoder.encode(repoName, StandardCharsets.UTF_8);
        HttpResponse<String> res = httpClient.send(
                get("/repos/" + encodedName + "/deployments"),
                HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200) {
            String bodyStr = res.body().trim();
            if (bodyStr.startsWith("[")) {
                return mapper.readValue(bodyStr, new TypeReference<List<DeploymentEntry>>() {});
            }
            JsonNode root = mapper.readTree(bodyStr);
            JsonNode arr  = root.isArray()               ? root
                          : root.has("deployments")      ? root.get("deployments")
                          : root.has("data")             ? root.get("data")
                          : root;
            return mapper.convertValue(arr, new TypeReference<List<DeploymentEntry>>() {});
        }
        throw new Exception(extractMessage(res.body(), "Failed to load deployments"));
    }

    /**
     * Fetches the log entries for a deployment.
     *
     * @param deploymentId the deployment ID (URL-encoded before use)
     * @return list of {@link LogEntry} objects
     * @throws Exception on network or authentication failure
     */
    public List<LogEntry> getLogs(String deploymentId) throws Exception {
        String encodedId = URLEncoder.encode(deploymentId, StandardCharsets.UTF_8);
        HttpResponse<String> res = httpClient.send(
                get("/deployments/" + encodedId + "/logs"),
                HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200) {
            String bodyStr = res.body().trim();
            if (bodyStr.startsWith("[")) {
                return mapper.readValue(bodyStr, new TypeReference<List<LogEntry>>() {});
            }
            JsonNode root = mapper.readTree(bodyStr);
            JsonNode arr  = root.isArray()          ? root
                          : root.has("logs")        ? root.get("logs")
                          : root.has("data")        ? root.get("data")
                          : root;
            return mapper.convertValue(arr, new TypeReference<List<LogEntry>>() {});
        }
        throw new Exception(extractMessage(res.body(), "Failed to load logs"));
    }

    /**
     * Fetches the current deploy queue status.
     *
     * @return a map of queue status fields
     * @throws Exception on network or authentication failure
     */
    public Map<String, Object> getQueueStatus() throws Exception {
        HttpResponse<String> res = httpClient.send(
                get("/queue/status"), HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() == 200) {
            return mapper.readValue(res.body(), new TypeReference<Map<String, Object>>() {});
        }
        throw new Exception("Queue status unavailable");
    }

    // ====================================================================
    //  Helpers
    // ====================================================================

    /**
     * Validates the configured API base URL.
     *
     * <p>For non-localhost hosts the scheme <em>must</em> be {@code https://}
     * to prevent credentials being sent over plaintext HTTP.
     *
     * @param apiBaseUrl the URL to validate
     * @throws SecurityException if the URL is not HTTPS for a remote host
     */
    private static void validateApiBaseUrl(String apiBaseUrl) {
        if (apiBaseUrl == null || apiBaseUrl.isBlank()) {
            throw new SecurityException("API base URL must not be blank.");
        }
        if (!HTTPS_PATTERN.matcher(apiBaseUrl).matches()
                && !LOCAL_HTTP_PATTERN.matcher(apiBaseUrl).matches()) {
            throw new SecurityException(
                    "API base URL must use HTTPS for non-localhost hosts: " + apiBaseUrl);
        }
    }

    private HttpRequest get(String path) throws Exception {
        return HttpRequest.newBuilder()
                .uri(URI.create(apiUrl(path)))
                .header("Authorization", "Bearer " + token())
                .GET()
                .build();
    }

    private HttpRequest post(String path, String body, boolean auth) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl(path)))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body));
        if (auth) b.header("Authorization", "Bearer " + token());
        return b.build();
    }

    private String apiUrl(String path) {
        return AppState.getInstance().getApiBaseUrl() + path;
    }

    /**
     * Returns the current user's JWT token.
     * The token is <strong>not</strong> logged at any level.
     *
     * @return the JWT token string
     * @throws Exception if the user is not logged in
     */
    private String token() throws Exception {
        User user = AppState.getInstance().getCurrentUser();
        if (user == null) throw new Exception("Not logged in.");
        return user.getToken();
    }

    /**
     * Extracts a human-readable error message from a JSON response body.
     *
     * @param body     the raw HTTP response body
     * @param fallback message to use if no structured message is found
     * @return the extracted or fallback message
     */
    private String extractMessage(String body, String fallback) {
        try {
            JsonNode json = mapper.readTree(body);
            if (json.has("message")) return json.get("message").asText();
            if (json.has("error"))   return json.get("error").asText();
        } catch (Exception ignored) {
            // Body is not valid JSON — fall through to raw body or fallback
        }
        return body != null && !body.isBlank() ? body : fallback;
    }
}

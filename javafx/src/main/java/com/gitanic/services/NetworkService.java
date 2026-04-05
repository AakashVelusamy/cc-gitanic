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
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;

/**
 * Repository-pattern service for all Gitanic REST API calls.
 * Pattern: Singleton + Repository
 * All methods are synchronous — callers run them on background threads.
 */
public final class NetworkService {

    private static NetworkService instance;

    private final HttpClient   httpClient = HttpClient.newHttpClient();
    private final ObjectMapper mapper     = new ObjectMapper();

    private NetworkService() {}

    public static synchronized NetworkService getInstance() {
        if (instance == null) instance = new NetworkService();
        return instance;
    }

    // ====================================================================
    //  Auth
    // ====================================================================

    public User login(String username, String password) throws Exception {
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

    public User register(String username, String password) throws Exception {
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

    public List<Repository> getRepositories() throws Exception {
        HttpResponse<String> res = httpClient.send(
                get("/repos"), HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200) {
            String bodyStr = res.body().trim();
            if (bodyStr.startsWith("[")) {
                return mapper.readValue(bodyStr, new TypeReference<List<Repository>>() {});
            }
            JsonNode root = mapper.readTree(bodyStr);
            JsonNode arr  = root.isArray() ? root
                          : root.has("repos") ? root.get("repos")
                          : root.has("data")  ? root.get("data")
                          : root;
            return mapper.convertValue(arr, new TypeReference<List<Repository>>() {});
        }
        throw new Exception(extractMessage(res.body(), "Failed to load repositories"));
    }

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

    public void deleteRepository(String repoName) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl("/repos/" + repoName)))
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

    public String triggerDeploy(String repoName) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl("/repos/" + repoName + "/deploy")))
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

    public List<DeploymentEntry> getDeployments(String repoName) throws Exception {
        HttpResponse<String> res = httpClient.send(
                get("/repos/" + repoName + "/deployments"),
                HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200) {
            String bodyStr = res.body().trim();
            if (bodyStr.startsWith("[")) {
                return mapper.readValue(bodyStr, new TypeReference<List<DeploymentEntry>>() {});
            }
            JsonNode root = mapper.readTree(bodyStr);
            JsonNode arr  = root.isArray() ? root
                          : root.has("deployments") ? root.get("deployments")
                          : root.has("data")        ? root.get("data")
                          : root;
            return mapper.convertValue(arr, new TypeReference<List<DeploymentEntry>>() {});
        }
        throw new Exception(extractMessage(res.body(), "Failed to load deployments"));
    }

    public List<LogEntry> getLogs(String deploymentId) throws Exception {
        HttpResponse<String> res = httpClient.send(
                get("/deployments/" + deploymentId + "/logs"),
                HttpResponse.BodyHandlers.ofString());

        if (res.statusCode() == 200) {
            String bodyStr = res.body().trim();
            if (bodyStr.startsWith("[")) {
                return mapper.readValue(bodyStr, new TypeReference<List<LogEntry>>() {});
            }
            JsonNode root = mapper.readTree(bodyStr);
            JsonNode arr  = root.isArray() ? root
                          : root.has("logs") ? root.get("logs")
                          : root.has("data") ? root.get("data")
                          : root;
            return mapper.convertValue(arr, new TypeReference<List<LogEntry>>() {});
        }
        throw new Exception(extractMessage(res.body(), "Failed to load logs"));
    }

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

    private String token() throws Exception {
        User user = AppState.getInstance().getCurrentUser();
        if (user == null) throw new Exception("Not logged in.");
        return user.getToken();
    }

    private String extractMessage(String body, String fallback) {
        try {
            JsonNode json = mapper.readTree(body);
            if (json.has("message")) return json.get("message").asText();
            if (json.has("error"))   return json.get("error").asText();
        } catch (Exception ignored) {}
        return body != null && !body.isBlank() ? body : fallback;
    }
}

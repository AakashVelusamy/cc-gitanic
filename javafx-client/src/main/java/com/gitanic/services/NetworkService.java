package com.gitanic.services;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gitanic.models.Repository;
import com.gitanic.models.User;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;

public class NetworkService {
    private static final String API_BASE_URL = "http://localhost:3000/api";
    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();
    private User currentUser;

    public void login(String username, String password) throws Exception {
        String requestBody = mapper.writeValueAsString(Map.of("username", username, "password", password));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(API_BASE_URL + "/auth/login"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200) {
            Map<String, Object> body = mapper.readValue(response.body(), new TypeReference<>() {});
            this.currentUser = new User(username, (String) body.get("token"));
        } else {
            throw new Exception("Login failed: " + response.body());
        }
    }

    public List<Repository> getRepositories() throws Exception {
        if (currentUser == null) throw new Exception("Not logged in");

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(API_BASE_URL + "/repos"))
                .header("Authorization", "Bearer " + currentUser.getToken())
                .GET()
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 200) {
            return mapper.readValue(response.body(), new TypeReference<List<Repository>>() {});
        } else {
            throw new Exception("Failed to fetch repos: " + response.body());
        }
    }

    public User getCurrentUser() {
        return currentUser;
    }
}

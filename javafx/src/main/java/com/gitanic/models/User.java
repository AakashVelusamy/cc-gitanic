package com.gitanic.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class User {
    private String username;
    private String token;

    public User() {}

    public User(String username, String token) {
        this.username = username;
        this.token    = token;
    }

    public String getUsername()            { return username; }
    public void   setUsername(String u)    { this.username = u; }

    public String getToken()               { return token; }
    public void   setToken(String t)       { this.token = t; }
}

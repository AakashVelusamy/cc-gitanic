package com.gitanic.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Represents an authenticated Gitanic user.
 *
 * <p>Deserialized from the {@code /auth/login} and {@code /auth/register}
 * API responses.  The {@code token} field holds a JWT that must be included
 * as a Bearer token in all authenticated API requests.
 *
 * <p>Security note: the token is sensitive — never log or persist it outside
 * of the OS-managed Preferences store.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class User {

    private String username;
    private String token;

    /** Required by Jackson for deserialization. */
    public User() {}

    /**
     * Constructs a {@link User} with the given username and JWT token.
     *
     * @param username the account username
     * @param token    the JWT bearer token (not logged)
     */
    public User(String username, String token) {
        this.username = username;
        this.token    = token;
    }

    /**
     * Returns the account username.
     *
     * @return username string
     */
    public String getUsername()            { return username; }

    /**
     * Sets the account username.
     *
     * @param u the username
     */
    public void   setUsername(String u)    { this.username = u; }

    /**
     * Returns the JWT bearer token.
     *
     * <p>Security note: do not log the return value.
     *
     * @return the token string
     */
    public String getToken()               { return token; }

    /**
     * Sets the JWT bearer token.
     *
     * @param t the token string (not logged)
     */
    public void   setToken(String t)       { this.token = t; }
}

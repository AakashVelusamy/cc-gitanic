package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.services.NetworkService;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.control.*;

import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Controller for the registration screen.
 *
 * <p>Validates input locally, delegates to {@link NetworkService#register},
 * and navigates to {@code RepoListScreen} on success.
 *
 * <p>Security note: passwords are never passed to any logger.
 */
public class RegisterController {

    private static final Logger LOG = Logger.getLogger(RegisterController.class.getName());

    @FXML private TextField         usernameField;
    @FXML private PasswordField     passwordField;
    @FXML private PasswordField     confirmPasswordField;
    @FXML private Button            registerButton;
    @FXML private Label             errorLabel;
    @FXML private ProgressIndicator loadingIndicator;

    /**
     * Called by the JavaFX runtime after FXML injection.
     * Wires the Enter key on the confirm-password field to submit the form.
     */
    @FXML
    public void initialize() {
        errorLabel.setVisible(false);
        loadingIndicator.setVisible(false);
        confirmPasswordField.setOnAction(e -> onRegisterClicked());
    }

    /**
     * Validates inputs and performs registration on a background daemon thread.
     * On success, navigates to {@code RepoListScreen}.
     * On failure, displays the error message from the server.
     */
    @FXML
    protected void onRegisterClicked() {
        String username = usernameField.getText().trim();
        String password = passwordField.getText();
        String confirm  = confirmPasswordField.getText();

        if (username.isEmpty() || password.isEmpty()) {
            showError("Username and password are required.");
            return;
        }
        if (!password.equals(confirm)) {
            showError("Passwords do not match.");
            return;
        }
        if (username.length() < 3) {
            showError("Username must be at least 3 characters.");
            return;
        }

        setLoading(true);

        // NOTE: password must not be logged — passed only as a method argument
        Thread t = new Thread(() -> {
            try {
                NetworkService.getInstance().register(username, password);
                Platform.runLater(() -> {
                    setLoading(false);
                    App.setRoot("RepoListScreen");
                });
            } catch (Exception e) {
                LOG.log(Level.WARNING, "Registration failed for user: {0}", username);
                Platform.runLater(() -> {
                    setLoading(false);
                    showError(e.getMessage());
                });
            }
        });
        t.setDaemon(true);
        t.start();
    }

    /**
     * Navigates back to the login screen.
     */
    @FXML
    protected void onBackClicked() {
        App.setRoot("LoginScreen");
    }

    // ------------------------------------------------------------------ private

    private void setLoading(boolean loading) {
        loadingIndicator.setVisible(loading);
        registerButton.setDisable(loading);
        errorLabel.setVisible(!loading && errorLabel.getText() != null
                              && !errorLabel.getText().isEmpty());
    }

    private void showError(String msg) {
        errorLabel.setText(msg);
        errorLabel.setVisible(true);
    }
}

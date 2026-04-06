package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.AppState;
import com.gitanic.EventBus;
import com.gitanic.services.NetworkService;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.control.*;

import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Controller for the login screen.
 *
 * <p>Handles credential input (with a show/hide password toggle), delegates
 * authentication to {@link NetworkService}, and navigates to
 * {@code CloneScreen} on success.
 *
 * <p>Security note: passwords are never passed to any logger.
 */
public class LoginController {

    private static final Logger LOG = Logger.getLogger(LoginController.class.getName());

    @FXML private TextField         usernameField;
    @FXML private PasswordField     passwordField;
    @FXML private TextField         passwordVisibleField;
    @FXML private Button            togglePasswordButton;
    @FXML private Button            loginButton;
    @FXML private Label             errorLabel;
    @FXML private ProgressIndicator loadingIndicator;

    private boolean passwordVisible = false;

    /**
     * Called by the JavaFX runtime after FXML injection.
     * Sets up visibility bindings between the password and clear-text fields,
     * and wires the Enter key to submit the form.
     */
    @FXML
    public void initialize() {
        errorLabel.setVisible(false);
        loadingIndicator.setVisible(false);
        passwordVisibleField.setVisible(false);
        passwordVisibleField.setManaged(false);

        // Keep both fields in sync so toggling visibility does not lose input
        passwordField.textProperty().addListener((obs, oldVal, newVal) -> {
            if (!passwordVisible) {
                passwordVisibleField.setText(newVal);
            }
        });
        passwordVisibleField.textProperty().addListener((obs, oldVal, newVal) -> {
            if (passwordVisible) {
                passwordField.setText(newVal);
            }
        });

        passwordField.setOnAction(e -> onLoginClicked());
        passwordVisibleField.setOnAction(e -> onLoginClicked());
        usernameField.setOnAction(e -> onLoginClicked());
    }

    /**
     * Validates inputs and performs login on a background daemon thread.
     * On success, navigates to {@code CloneScreen}.
     * On failure, displays the error message from the server.
     */
    @FXML
    protected void onLoginClicked() {
        String username = usernameField.getText().trim();
        // Read password from whichever field is currently visible
        String password = passwordVisible
                ? passwordVisibleField.getText()
                : passwordField.getText();

        if (username.isEmpty() || password.isEmpty()) {
            showError("Username and password are required.");
            return;
        }

        setLoading(true);

        // NOTE: password must not be logged — pass only as a method argument
        Thread t = new Thread(() -> {
            try {
                NetworkService.getInstance().login(username, password);
                Platform.runLater(() -> {
                    setLoading(false);
                    EventBus.getInstance().publish(EventBus.Event.LOGIN_SUCCESS);
                    App.setRoot("CloneScreen");
                });
            } catch (Exception e) {
                LOG.log(Level.WARNING, "Login failed for user: {0}", username);
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
     * Toggles between the masked {@link PasswordField} and a plain
     * {@link TextField}, keeping their contents in sync.
     */
    @FXML
    protected void onTogglePassword() {
        passwordVisible = !passwordVisible;
        if (passwordVisible) {
            passwordVisibleField.setText(passwordField.getText());
            passwordVisibleField.setVisible(true);
            passwordVisibleField.setManaged(true);
            passwordField.setVisible(false);
            passwordField.setManaged(false);
            togglePasswordButton.setText("\uD83D\uDE48"); // 🙈
            passwordVisibleField.requestFocus();
            passwordVisibleField.positionCaret(passwordVisibleField.getText().length());
        } else {
            passwordField.setText(passwordVisibleField.getText());
            passwordField.setVisible(true);
            passwordField.setManaged(true);
            passwordVisibleField.setVisible(false);
            passwordVisibleField.setManaged(false);
            togglePasswordButton.setText("\uD83D\uDC41"); // 👁
            passwordField.requestFocus();
            passwordField.positionCaret(passwordField.getText().length());
        }
    }

    // ------------------------------------------------------------------ private

    private void setLoading(boolean loading) {
        loadingIndicator.setVisible(loading);
        loginButton.setDisable(loading);
        if (!loading) {
            errorLabel.setVisible(
                errorLabel.getText() != null && !errorLabel.getText().isEmpty());
        }
    }

    private void showError(String msg) {
        errorLabel.setText(msg);
        errorLabel.setVisible(true);
    }
}

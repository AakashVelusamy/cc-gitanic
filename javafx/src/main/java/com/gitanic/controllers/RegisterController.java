package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.AppState;
import com.gitanic.services.NetworkService;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.control.*;

/**
 * Registration screen controller.
 */
public class RegisterController {

    @FXML private TextField         usernameField;
    @FXML private PasswordField     passwordField;
    @FXML private PasswordField     confirmPasswordField;
    @FXML private Button            registerButton;
    @FXML private Label             errorLabel;
    @FXML private ProgressIndicator loadingIndicator;

    @FXML
    public void initialize() {
        errorLabel.setVisible(false);
        loadingIndicator.setVisible(false);
        confirmPasswordField.setOnAction(e -> onRegisterClicked());
    }

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

        new Thread(() -> {
            try {
                NetworkService.getInstance().register(username, password);
                Platform.runLater(() -> {
                    setLoading(false);
                    App.setRoot("RepoListScreen");
                });
            } catch (Exception e) {
                Platform.runLater(() -> {
                    setLoading(false);
                    showError(e.getMessage());
                });
            }
        }).start();
    }

    @FXML
    protected void onBackClicked() {
        App.setRoot("LoginScreen");
    }

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

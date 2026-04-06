package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.AppState;
import com.gitanic.EventBus;
import com.gitanic.services.NetworkService;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.control.*;

public class LoginController {

    @FXML private TextField         usernameField;
    @FXML private PasswordField     passwordField;
    @FXML private TextField         passwordVisibleField;
    @FXML private Button            togglePasswordButton;
    @FXML private Button            loginButton;
    @FXML private Label             errorLabel;
    @FXML private ProgressIndicator loadingIndicator;

    private boolean passwordVisible = false;

    @FXML
    public void initialize() {
        errorLabel.setVisible(false);
        loadingIndicator.setVisible(false);
        passwordVisibleField.setVisible(false);
        passwordVisibleField.setManaged(false);

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

    @FXML
    protected void onLoginClicked() {
        String username = usernameField.getText().trim();
        String password = passwordVisible ? passwordVisibleField.getText() : passwordField.getText();

        if (username.isEmpty() || password.isEmpty()) {
            showError("Username and password are required.");
            return;
        }

        setLoading(true);

        new Thread(() -> {
            try {
                NetworkService.getInstance().login(username, password);
                Platform.runLater(() -> {
                    setLoading(false);
                    EventBus.getInstance().publish(EventBus.Event.LOGIN_SUCCESS);
                    App.setRoot("CloneScreen");
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
    protected void onTogglePassword() {
        passwordVisible = !passwordVisible;
        if (passwordVisible) {
            passwordVisibleField.setText(passwordField.getText());
            passwordVisibleField.setVisible(true);
            passwordVisibleField.setManaged(true);
            passwordField.setVisible(false);
            passwordField.setManaged(false);
            togglePasswordButton.setText("🙈");
            passwordVisibleField.requestFocus();
            passwordVisibleField.positionCaret(passwordVisibleField.getText().length());
        } else {
            passwordField.setText(passwordVisibleField.getText());
            passwordField.setVisible(true);
            passwordField.setManaged(true);
            passwordVisibleField.setVisible(false);
            passwordVisibleField.setManaged(false);
            togglePasswordButton.setText("👁");
            passwordField.requestFocus();
            passwordField.positionCaret(passwordField.getText().length());
        }
    }

    private void setLoading(boolean loading) {
        loadingIndicator.setVisible(loading);
        loginButton.setDisable(loading);
        if (!loading) errorLabel.setVisible(
            errorLabel.getText() != null && !errorLabel.getText().isEmpty());
    }

    private void showError(String msg) {
        errorLabel.setText(msg);
        errorLabel.setVisible(true);
    }
}

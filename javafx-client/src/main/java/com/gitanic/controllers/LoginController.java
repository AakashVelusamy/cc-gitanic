package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.services.NetworkService;
import javafx.fxml.FXML;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.TextField;

public class LoginController {
    @FXML private TextField usernameField;
    @FXML private PasswordField passwordField;
    @FXML private Label errorLabel;

    public static final NetworkService networkService = new NetworkService();

    @FXML
    protected void onLoginClicked() {
        String username = usernameField.getText();
        String password = passwordField.getText();

        try {
            networkService.login(username, password);
            App.setRoot("RepoListScreen");
        } catch (Exception e) {
            errorLabel.setText(e.getMessage());
        }
    }
}

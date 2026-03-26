package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.services.GitCommandService;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.control.Label;
import javafx.scene.control.TextArea;

public class PushPullController {

    @FXML private TextArea outputArea;
    @FXML private Label statusLabel;

    private GitCommandService gitService = new GitCommandService();

    @FXML
    protected void onPushClicked() {
        statusLabel.setText("Pushing to origin...");
        outputArea.clear();
        new Thread(() -> {
            try {
                String out = gitService.push(CloneController.currentRepoDir);
                Platform.runLater(() -> {
                    outputArea.setText(out);
                    statusLabel.setStyle("-fx-text-fill: green;");
                    statusLabel.setText("Push successful.");
                });
            } catch (Exception e) {
                Platform.runLater(() -> {
                    outputArea.setText(e.getMessage());
                    statusLabel.setStyle("-fx-text-fill: red;");
                    statusLabel.setText("Push failed.");
                });
            }
        }).start();
    }

    @FXML
    protected void onPullClicked() {
        statusLabel.setText("Pulling from origin...");
        outputArea.clear();
        new Thread(() -> {
            try {
                String out = gitService.pull(CloneController.currentRepoDir);
                Platform.runLater(() -> {
                    outputArea.setText(out);
                    statusLabel.setStyle("-fx-text-fill: green;");
                    statusLabel.setText("Pull successful.");
                });
            } catch (Exception e) {
                Platform.runLater(() -> {
                    outputArea.setText(e.getMessage());
                    statusLabel.setStyle("-fx-text-fill: red;");
                    statusLabel.setText("Pull failed.");
                });
            }
        }).start();
    }

    @FXML
    protected void onBackClicked() {
        App.setRoot("DiffScreen");
    }
}

package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.services.GitCommandService;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;

public class CommitController {

    @FXML private TextField messageField;
    @FXML private Label statusLabel;

    private GitCommandService gitService = new GitCommandService();

    @FXML
    protected void onCommitClicked() {
        String msg = messageField.getText();
        if (msg.isEmpty()) {
            statusLabel.setText("Commit message cannot be empty.");
            return;
        }

        statusLabel.setText("Committing...");
        
        new Thread(() -> {
            try {
                gitService.addAll(CloneController.currentRepoDir);
                gitService.commit(CloneController.currentRepoDir, msg);
                Platform.runLater(() -> {
                    statusLabel.setStyle("-fx-text-fill: green;");
                    statusLabel.setText("Committed successfully!");
                    messageField.clear();
                });
            } catch (Exception e) {
                Platform.runLater(() -> {
                    statusLabel.setStyle("-fx-text-fill: red;");
                    statusLabel.setText("Error: " + e.getMessage());
                });
            }
        }).start();
    }

    @FXML
    protected void onBackClicked() {
        App.setRoot("DiffScreen");
    }
}

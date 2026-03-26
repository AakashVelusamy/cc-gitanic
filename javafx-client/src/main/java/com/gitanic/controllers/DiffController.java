package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.services.GitCommandService;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.control.Label;
import javafx.scene.control.TextArea;

public class DiffController {

    @FXML private TextArea diffArea;
    @FXML private Label statusLabel;

    private GitCommandService gitService = new GitCommandService();

    @FXML
    public void initialize() {
        if (CloneController.currentRepoDir == null) {
            statusLabel.setText("No repository selected.");
            return;
        }

        new Thread(() -> {
            try {
                String diffOutput = gitService.diff(CloneController.currentRepoDir);
                if (diffOutput.isEmpty()) {
                    diffOutput = "No uncommitted changes.";
                }
                final String text = diffOutput;
                Platform.runLater(() -> diffArea.setText(text));
            } catch (Exception e) {
                Platform.runLater(() -> statusLabel.setText("Error: " + e.getMessage()));
            }
        }).start();
    }

    @FXML
    protected void onCommitClicked() {
        App.setRoot("CommitScreen");
    }

    @FXML
    protected void onPushPullClicked() {
        App.setRoot("PushPullScreen");
    }

    @FXML
    protected void onBackClicked() {
        App.setRoot("RepoListScreen");
    }
}

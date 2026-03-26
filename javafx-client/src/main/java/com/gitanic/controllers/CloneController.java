package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.services.GitCommandService;
import javafx.fxml.FXML;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.stage.DirectoryChooser;

import java.io.File;

public class CloneController {

    @FXML private TextField urlField;
    @FXML private TextField pathField;
    @FXML private Label statusLabel;

    private GitCommandService gitService = new GitCommandService();
    public static File currentRepoDir;

    @FXML
    public void initialize() {
        if (RepoListController.selectedRepository != null) {
            String username = LoginController.networkService.getCurrentUser().getUsername();
            String repoName = RepoListController.selectedRepository.getName();
            // Basic HTTP basic auth URL for cloning
            urlField.setText("http://" + username + "@localhost:3000/git/" + username + "/" + repoName + ".git");
        }
    }

    @FXML
    protected void onBrowseClicked() {
        DirectoryChooser chooser = new DirectoryChooser();
        chooser.setTitle("Select Target Directory");
        File dir = chooser.showDialog(App.getPrimaryStage());
        if (dir != null) {
            pathField.setText(dir.getAbsolutePath());
        }
    }

    @FXML
    protected void onCloneClicked() {
        String url = urlField.getText();
        String path = pathField.getText();

        if (url.isEmpty() || path.isEmpty()) {
            statusLabel.setText("URL and Path required");
            return;
        }

        try {
            statusLabel.setText("Cloning...");
            File targetDir = new File(path);
            gitService.clone(url, targetDir);
            statusLabel.setText("Cloned successfully!");
            
            // Extract the repo name from the URL to set as the active repo directory
            String[] parts = url.split("/");
            String repoName = parts[parts.length - 1].replace(".git", "");
            currentRepoDir = new File(targetDir, repoName);
            
            App.setRoot("DiffScreen");
        } catch (Exception e) {
            statusLabel.setText("Error: " + e.getMessage());
        }
    }
    
    @FXML
    protected void onBackClicked() {
        App.setRoot("RepoListScreen");
    }
}

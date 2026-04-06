package com.gitanic.controllers;

import com.gitanic.App;
import javafx.fxml.FXML;
import javafx.scene.control.Label;
import javafx.scene.control.TextArea;

/**
 * Legacy screen — redirects to the new WorkspaceScreen.
 * Kept for FXML compatibility only.
 */
public class DiffController {

    @FXML private TextArea diffArea;
    @FXML private Label    statusLabel;

    @FXML
    public void initialize() {
        App.setRoot("WorkspaceScreen");
    }

    @FXML protected void onCommitClicked()   { App.setRoot("WorkspaceScreen"); }
    @FXML protected void onPushPullClicked() { App.setRoot("WorkspaceScreen"); }
    @FXML protected void onBackClicked()     { App.setRoot("RepoListScreen"); }
}

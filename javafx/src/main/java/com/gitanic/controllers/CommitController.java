package com.gitanic.controllers;

import com.gitanic.App;
import javafx.fxml.FXML;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;

/**
 * Legacy screen — redirects immediately to {@code WorkspaceScreen}.
 *
 * <p>Kept for FXML compatibility only.  All git operations have been
 * consolidated into {@link WorkspaceController}.
 */
public class CommitController {

    @FXML private TextField messageField;
    @FXML private Label     statusLabel;

    /** Redirects to {@code WorkspaceScreen} immediately on load. */
    @FXML
    public void initialize() {
        App.setRoot("WorkspaceScreen");
    }

    /** Redirects to {@code WorkspaceScreen}. */
    @FXML
    protected void onCommitClicked() {
        App.setRoot("WorkspaceScreen");
    }

    /** Navigates back to {@code WorkspaceScreen}. */
    @FXML
    protected void onBackClicked() {
        App.setRoot("WorkspaceScreen");
    }
}

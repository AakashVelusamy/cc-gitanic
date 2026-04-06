package com.gitanic.controllers;

import com.gitanic.App;
import javafx.fxml.FXML;
import javafx.scene.control.Label;
import javafx.scene.control.TextArea;

/**
 * Legacy screen — redirects immediately to {@code WorkspaceScreen}.
 *
 * <p>Kept for FXML compatibility only.  All push/pull operations have been
 * consolidated into the Sync action in {@link WorkspaceController}.
 */
public class PushPullController {

    @FXML private TextArea outputArea;
    @FXML private Label    statusLabel;

    /** Redirects to {@code WorkspaceScreen} immediately on load. */
    @FXML
    public void initialize() {
        App.setRoot("WorkspaceScreen");
    }

    /** Redirects to {@code WorkspaceScreen}. */
    @FXML
    protected void onPushClicked() {
        App.setRoot("WorkspaceScreen");
    }

    /** Redirects to {@code WorkspaceScreen}. */
    @FXML
    protected void onPullClicked() {
        App.setRoot("WorkspaceScreen");
    }

    /** Navigates back to {@code WorkspaceScreen}. */
    @FXML
    protected void onBackClicked() {
        App.setRoot("WorkspaceScreen");
    }
}

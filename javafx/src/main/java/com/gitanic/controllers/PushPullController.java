package com.gitanic.controllers;

import com.gitanic.App;
import javafx.fxml.FXML;
import javafx.scene.control.Label;
import javafx.scene.control.TextArea;

/**
 * Legacy screen — redirects to the new WorkspaceScreen.
 * Kept for FXML compatibility only.
 */
public class PushPullController {

    @FXML private TextArea outputArea;
    @FXML private Label    statusLabel;

    @FXML public void initialize()        { App.setRoot("WorkspaceScreen"); }
    @FXML protected void onPushClicked()  { App.setRoot("WorkspaceScreen"); }
    @FXML protected void onPullClicked()  { App.setRoot("WorkspaceScreen"); }
    @FXML protected void onBackClicked()  { App.setRoot("WorkspaceScreen"); }
}

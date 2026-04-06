package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.AppState;
import com.gitanic.EventBus;
import com.gitanic.services.GitCommandService;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Cursor;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;

import java.io.File;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.prefs.Preferences;

/**
 * Home screen after login.
 * Shows cards for all git repos found in the persistent workspace folder.
 * Clone always writes into the workspace folder.
 */
public class CloneController {

    @FXML private Label       welcomeLabel;
    @FXML private Label       workspaceFolderLabel;
    @FXML private TextField   urlField;
    @FXML private ProgressBar progressBar;
    @FXML private Label       statusLabel;
    @FXML private Button      cloneButton;
    @FXML private VBox        localReposContainer;

    private static final String PREFS_KEY_WORKSPACE = "gitanic.workspace.dir";

    @FXML
    public void initialize() {
        progressBar.setVisible(false);
        statusLabel.setVisible(false);

        AppState state = AppState.getInstance();
        String username = state.getCurrentUser() != null ? state.getCurrentUser().getUsername() : "";
        welcomeLabel.setText("Welcome, " + username);

        String override = state.getOverrideCloneUrl();
        if (override != null && !override.isBlank()) {
            urlField.setText(override);
        }

        workspaceFolderLabel.setText(getWorkspaceDir());
        renderLocalRepos();
    }

    // ====================================================================
    //  Workspace folder persistence
    // ====================================================================

    private static Preferences prefs() {
        return Preferences.userNodeForPackage(CloneController.class);
    }

    /** Returns the persisted workspace folder path, defaulting to ~/gitanic. */
    public static String getWorkspaceDir() {
        String def = System.getProperty("user.home") + File.separator + "gitanic";
        return prefs().get(PREFS_KEY_WORKSPACE, def);
    }

    private static void setWorkspaceDir(String path) {
        prefs().put(PREFS_KEY_WORKSPACE, path);
    }

    // ====================================================================
    //  Scan workspace for repos
    // ====================================================================

    /** Returns all immediate subdirectories of the workspace that contain .git. */
    private List<File> scanWorkspace() {
        File workspace = new File(getWorkspaceDir());
        if (!workspace.exists() || !workspace.isDirectory()) return Collections.emptyList();
        File[] subdirs = workspace.listFiles(f -> f.isDirectory() && new File(f, ".git").exists());
        if (subdirs == null) return Collections.emptyList();
        Arrays.sort(subdirs, Comparator.comparing(File::getName));
        return Arrays.asList(subdirs);
    }

    // ====================================================================
    //  Render local repo cards
    // ====================================================================

    private void renderLocalRepos() {
        localReposContainer.getChildren().clear();
        List<File> repos = scanWorkspace();

        if (repos.isEmpty()) {
            Label empty = new Label("No repositories in workspace. Clone one below or change the workspace folder.");
            empty.getStyleClass().add("muted-label");
            empty.setWrapText(true);
            localReposContainer.getChildren().add(empty);
            return;
        }

        for (File repoDir : repos) {
            localReposContainer.getChildren().add(buildRepoCard(repoDir));
        }
    }

    private Node buildRepoCard(File dir) {
        GitCommandService git      = GitCommandService.getInstance();
        String            repoName  = dir.getName();
        String            remoteUrl = GitCommandService.stripCredentials(git.getRemoteUrl(dir).trim());

        HBox card = new HBox(12);
        card.getStyleClass().add("repo-card");
        card.setAlignment(Pos.CENTER_LEFT);
        card.setPadding(new Insets(12, 16, 12, 16));
        card.setCursor(Cursor.HAND);

        // Double-click opens the workspace for this repo
        card.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2) openLocalRepo(dir);
        });

        VBox info = new VBox(3);
        Label nameLabel = new Label(repoName);
        nameLabel.getStyleClass().add("repo-card-name");

        Label pathLabel = new Label(dir.getAbsolutePath());
        pathLabel.getStyleClass().add("repo-card-url");

        if (!remoteUrl.isBlank()) {
            Label urlLabel = new Label(remoteUrl);
            urlLabel.getStyleClass().add("card-meta");
            info.getChildren().addAll(nameLabel, pathLabel, urlLabel);
        } else {
            info.getChildren().addAll(nameLabel, pathLabel);
        }
        HBox.setHgrow(info, Priority.ALWAYS);

        card.getChildren().add(info);
        return card;
    }

    // ====================================================================
    //  Actions
    // ====================================================================

    @FXML
    protected void onChangeFolderClicked() {
        DirectoryChooser chooser = new DirectoryChooser();
        chooser.setTitle("Choose Workspace Folder");
        File current = new File(getWorkspaceDir());
        if (current.exists()) chooser.setInitialDirectory(current);
        File dir = chooser.showDialog(App.getPrimaryStage());
        if (dir != null) {
            setWorkspaceDir(dir.getAbsolutePath());
            workspaceFolderLabel.setText(dir.getAbsolutePath());
            renderLocalRepos();
        }
    }

    @FXML
    protected void onCloneClicked() {
        String rawUrl = urlField.getText().trim();
        if (rawUrl.isEmpty()) {
            showStatus("Repository URL is required.", true);
            return;
        }

        File workspace = new File(getWorkspaceDir());
        if (!workspace.exists() && !workspace.mkdirs()) {
            showStatus("Could not create workspace folder: " + workspace.getAbsolutePath(), true);
            return;
        }

        AppState state    = AppState.getInstance();
        String   authUrl  = state.injectCredentials(rawUrl);
        String   repoName = GitCommandService.repoNameFromUrl(rawUrl);

        setCloning(true);

        new Thread(() -> {
            try {
                GitCommandService.getInstance().clone(authUrl, workspace, repoName);

                // Clean remote URL — remove embedded credentials
                File repoDir = new File(workspace, repoName);
                String cleanUrl = GitCommandService.stripCredentials(authUrl);
                try {
                    GitCommandService.getInstance().run(repoDir, "remote", "set-url", "origin", cleanUrl);
                } catch (Exception ignored) {}

                state.setCurrentRepoDir(repoDir);
                state.setOverrideCloneUrl(null);

                Platform.runLater(() -> {
                    setCloning(false);
                    urlField.clear();
                    renderLocalRepos();   // show the new card before navigating
                    EventBus.getInstance().publish(EventBus.Event.REPO_DIR_OPENED, repoDir);
                    App.setRoot("WorkspaceScreen");
                });
            } catch (Exception e) {
                Platform.runLater(() -> {
                    setCloning(false);
                    showStatus("Clone failed: " + e.getMessage(), true);
                });
            }
        }).start();
    }

    @FXML
    protected void onOpenExistingClicked() {
        DirectoryChooser chooser = new DirectoryChooser();
        chooser.setTitle("Open Existing Local Repository");
        File ws = new File(getWorkspaceDir());
        chooser.setInitialDirectory(ws.exists() ? ws : new File(System.getProperty("user.home")));
        File dir = chooser.showDialog(App.getPrimaryStage());
        if (dir != null) openLocalRepo(dir);
    }

    private void openLocalRepo(File dir) {
        if (!new File(dir, ".git").exists()) {
            showStatus("Not a git repository (no .git folder).", true);
            return;
        }
        AppState.getInstance().setCurrentRepoDir(dir);
        EventBus.getInstance().publish(EventBus.Event.REPO_DIR_OPENED, dir);
        App.setRoot("WorkspaceScreen");
    }

    @FXML
    protected void onLogoutClicked() {
        AppState.getInstance().logout();
        EventBus.getInstance().publish(EventBus.Event.LOGOUT);
        App.setRoot("LoginScreen");
    }

    // ====================================================================
    //  Helpers
    // ====================================================================

    private void setCloning(boolean cloning) {
        progressBar.setVisible(cloning);
        cloneButton.setDisable(cloning);
        statusLabel.setVisible(false);
        if (cloning) showStatus("Cloning repository...", false);
    }

    private void showStatus(String msg, boolean isError) {
        statusLabel.setText(msg);
        statusLabel.setStyle(isError ? "-fx-text-fill: #f43f5e;" : "-fx-text-fill: #3fb950;");
        statusLabel.setVisible(true);
    }
}

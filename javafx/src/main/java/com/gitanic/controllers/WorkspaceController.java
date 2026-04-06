package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.AppState;
import com.gitanic.EventBus;
import com.gitanic.models.FileStatus;
import com.gitanic.services.GitCommandService;
import javafx.animation.Animation;
import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.fxml.FXML;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.util.Duration;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Workspace controller — streamlined Git client.
 * Two tabs: Diff and File Content. Single Sync button (fetch+pull).
 * Only Commit & Push action (no standalone commit).
 */
public class WorkspaceController {

    // ---- Toolbar -------------------------------------------------------
    @FXML private Label  repoNameLabel;
    @FXML private Button syncButton;
    @FXML private Label  operationStatusLabel;

    // ---- Sidebar — File list -------------------------------------------
    @FXML private Label                filesCountLabel;
    @FXML private ListView<FileStatus> filesListView;

    // ---- Main TabPane --------------------------------------------------
    @FXML private TabPane mainTabPane;

    // ---- Diff tab -------------------------------------------------------
    @FXML private ListView<String> diffListView;
    @FXML private Label            diffFileLabel;

    // ---- File Content tab -----------------------------------------------
    @FXML private ListView<String> fileContentListView;
    @FXML private Label            fileContentLabel;

    // ---- Commit bar (bottom) -------------------------------------------
    @FXML private TextField commitMessageField;
    @FXML private Button    commitAndPushButton;
    @FXML private Label     commitStatusLabel;

    // ---- Status bar ----------------------------------------------------
    @FXML private Label statusBarLabel;

    // ---- Internal state ------------------------------------------------
    private File     repoDir;
    private Timeline autoRefreshTimeline;
    private volatile boolean isRefreshing = false;
    private final Consumer<Object> refreshHandler = ignored -> refreshWorkspace();

    // ====================================================================
    //  Initialization
    // ====================================================================

    @FXML
    public void initialize() {
        repoDir = AppState.getInstance().getCurrentRepoDir();
        if (repoDir == null) {
            statusBarLabel.setText("  No repository open.");
            return;
        }

        repoNameLabel.setText(repoDir.getName());
        operationStatusLabel.setText("");
        commitStatusLabel.setText("");
        diffFileLabel.setText("Select a file to view its diff");
        fileContentLabel.setText("Select a file to view its content");

        diffListView.setCellFactory(lv -> new DiffLineCell());
        fileContentListView.setCellFactory(lv -> new FileContentCell());
        filesListView.setCellFactory(lv -> new FileStatusCell());

        // Clicking a file loads both diff and file content
        filesListView.getSelectionModel().selectedItemProperty()
                .addListener((obs, old, nv) -> {
                    if (nv != null) {
                        diffFileLabel.setText(nv.getPath());
                        fileContentLabel.setText(nv.getPath());
                        loadDiff(nv);
                        loadFileContent(nv);
                        mainTabPane.getSelectionModel().select(0);
                    }
                });

        // Enter key on commit field triggers commit & push
        commitMessageField.setOnAction(e -> onCommitAndPushClicked());

        EventBus.getInstance().subscribe(EventBus.Event.WORKSPACE_REFRESH, refreshHandler);

        refreshWorkspace();
        startAutoRefresh();
    }

    // ====================================================================
    //  Auto-refresh (every 2 seconds)
    // ====================================================================

    private void startAutoRefresh() {
        autoRefreshTimeline = new Timeline(
                new KeyFrame(Duration.seconds(2), e -> refreshFileList()));
        autoRefreshTimeline.setCycleCount(Animation.INDEFINITE);
        autoRefreshTimeline.play();
    }

    private void refreshFileList() {
        if (repoDir == null || isRefreshing) return;
        isRefreshing = true;
        GitCommandService git = GitCommandService.getInstance();
        runAsync(
            () -> {
                List<FileStatus> statuses = git.getStatus(repoDir);
                return new Object[]{ statuses };
            },
            result -> {
                isRefreshing = false;
                @SuppressWarnings("unchecked")
                List<FileStatus> statuses = (List<FileStatus>) result[0];
                filesListView.setItems(FXCollections.observableArrayList(statuses));
                int n = statuses.size();
                filesCountLabel.setText(n == 0 ? "FILES" : "FILES  " + n);
                updateStatusBar(statuses);
            },
            err -> isRefreshing = false
        );
    }

    private void refreshWorkspace() {
        if (repoDir == null) return;
        GitCommandService git = GitCommandService.getInstance();
        runAsync(
            () -> {
                List<FileStatus>  statuses = git.getStatus(repoDir);
                return new Object[]{ statuses };
            },
            result -> {
                @SuppressWarnings("unchecked")
                List<FileStatus>  statuses = (List<FileStatus>)  result[0];

                filesListView.setItems(FXCollections.observableArrayList(statuses));
                int n = statuses.size();
                filesCountLabel.setText(n == 0 ? "FILES" : "FILES  " + n);
                updateStatusBar(statuses);
            },
            err -> statusBarLabel.setText("  Error: " + err)
        );
    }

    private void updateStatusBar(List<FileStatus> statuses) {
        statusBarLabel.setText("  " + statuses.size() + " changed"
                + "    " + repoDir.getAbsolutePath());
    }

    // ====================================================================
    //  Diff display
    // ====================================================================

    private void loadDiff(FileStatus file) {
        runAsync(
            () -> {
                GitCommandService git = GitCommandService.getInstance();
                // For new/untracked files, show the full content as + lines
                if (file.getX() == FileStatus.Code.UNTRACKED) {
                    return "(new file)";
                }
                return git.getDiffAgainstHead(repoDir, file.getPath());
            },
            this::renderDiff,
            err -> renderDiff("Error loading diff:\n" + err)
        );
    }

    private void renderDiff(String raw) {
        List<String> lines = new ArrayList<>();
        if (raw != null) for (String l : raw.split("\n")) lines.add(l);
        diffListView.setItems(FXCollections.observableArrayList(lines));
    }

    // ====================================================================
    //  File Content display
    // ====================================================================

    private void loadFileContent(FileStatus file) {
        runAsync(
            () -> GitCommandService.getInstance().readFileContent(repoDir, file.getPath()),
            content -> {
                List<String> lines = new ArrayList<>();
                if (content != null) {
                    int lineNum = 1;
                    for (String l : content.split("\n", -1)) {
                        lines.add(String.format("%4d  %s", lineNum++, l));
                    }
                }
                fileContentListView.setItems(FXCollections.observableArrayList(lines));
            },
            err -> {
                List<String> errLines = new ArrayList<>();
                errLines.add("Could not read file: " + err);
                fileContentListView.setItems(FXCollections.observableArrayList(errLines));
            }
        );
    }

    // ====================================================================
    //  Commit & Push
    // ====================================================================

    @FXML protected void onCommitAndPushClicked() {
        String msg = commitMessageField.getText().trim();
        if (msg.isEmpty()) { setCommitStatus("Enter a commit message.", true); return; }
        if (filesListView.getItems().isEmpty()) { setCommitStatus("No changes to commit.", true); return; }
        String authUrl = buildAuthUrl();
        setCommitStatus("Committing & pushing...", false);
        runAsync(
            () -> {
                GitCommandService git = GitCommandService.getInstance();
                git.commitAll(repoDir, msg);
                git.push(repoDir, authUrl);
                return null;
            },
            r -> { commitMessageField.clear(); setCommitStatus("Committed & pushed.", false); refreshWorkspace(); },
            err -> setCommitStatus(err, true)
        );
    }

    private void setCommitStatus(String msg, boolean err) {
        commitStatusLabel.setText(msg);
        commitStatusLabel.setStyle(err ? "-fx-text-fill:#f43f5e;" : "-fx-text-fill:#3fb950;");
    }

    // ====================================================================
    //  Sync (fetch + pull)
    // ====================================================================

    @FXML protected void onSyncClicked() {
        operationStatusLabel.setText("Syncing...");
        syncButton.setDisable(true);
        String authUrl = buildAuthUrl();
        runAsync(
            () -> {
                GitCommandService git = GitCommandService.getInstance();
                git.fetch(repoDir);
                return git.pull(repoDir, authUrl);
            },
            out -> {
                operationStatusLabel.setText("Synced.");
                syncButton.setDisable(false);
                refreshWorkspace();
            },
            err -> {
                operationStatusLabel.setText("Sync failed: " + err);
                syncButton.setDisable(false);
            }
        );
    }

    private String buildAuthUrl() {
        AppState state = AppState.getInstance();
        if (state.getCurrentUser() == null || state.getPassword() == null) return null;
        if (state.getSelectedRepo() != null) {
            return state.buildAuthUrl(state.getCurrentUser().getUsername(),
                                      state.getSelectedRepo().getName());
        }
        String remote = GitCommandService.getInstance().getRemoteUrl(repoDir);
        return remote.isBlank() ? null : state.injectCredentials(remote);
    }

    // ====================================================================
    //  Navigation
    // ====================================================================

    @FXML protected void onBackClicked() {
        if (autoRefreshTimeline != null) autoRefreshTimeline.stop();
        EventBus.getInstance().unsubscribe(EventBus.Event.WORKSPACE_REFRESH, refreshHandler);
        App.setRoot("CloneScreen");
    }

    // ====================================================================
    //  Async helper
    // ====================================================================

    @FunctionalInterface
    private interface ThrowingSupplier<T> { T get() throws Exception; }

    private <T> void runAsync(ThrowingSupplier<T> task,
                               Consumer<T> onSuccess,
                               Consumer<String> onError) {
        new Thread(() -> {
            try {
                T result = task.get();
                Platform.runLater(() -> onSuccess.accept(result));
            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                Platform.runLater(() -> onError.accept(msg));
            }
        }).start();
    }

    // ====================================================================
    //  Cell renderers
    // ====================================================================

    private static final class DiffLineCell extends ListCell<String> {
        @Override
        protected void updateItem(String item, boolean empty) {
            super.updateItem(item, empty);
            if (empty || item == null) { setText(null); setStyle(null); return; }
            setText(item);
            if (item.startsWith("+") && !item.startsWith("+++")) {
                setStyle("-fx-background-color:#0a2e1a;-fx-text-fill:#3fb950;"
                       + "-fx-font-family:Consolas,'Courier New',monospace;-fx-font-size:12;"
                       + "-fx-padding:0;-fx-line-spacing:0;");
            } else if (item.startsWith("-") && !item.startsWith("---")) {
                setStyle("-fx-background-color:#2e0a14;-fx-text-fill:#f43f5e;"
                       + "-fx-font-family:Consolas,'Courier New',monospace;-fx-font-size:12;"
                       + "-fx-padding:0;-fx-line-spacing:0;");
            } else if (item.startsWith("@@")) {
                setStyle("-fx-background-color:#0b1528;-fx-text-fill:#00f0ff;"
                       + "-fx-font-family:Consolas,'Courier New',monospace;-fx-font-size:12;"
                       + "-fx-padding:0;-fx-line-spacing:0;");
            } else if (item.startsWith("diff ") || item.startsWith("index ")
                    || item.startsWith("---") || item.startsWith("+++")) {
                setStyle("-fx-background-color:#0b1528;-fx-text-fill:#94a3b8;"
                       + "-fx-font-family:Consolas,'Courier New',monospace;-fx-font-size:12;"
                       + "-fx-font-weight:bold;-fx-padding:0;-fx-line-spacing:0;");
            } else {
                setStyle("-fx-background-color:transparent;-fx-text-fill:#f8fafc;"
                       + "-fx-font-family:Consolas,'Courier New',monospace;-fx-font-size:12;"
                       + "-fx-padding:0;-fx-line-spacing:0;");
            }
        }
    }

    /** Renders file content lines with line numbers in a monospace font. */
    private static final class FileContentCell extends ListCell<String> {
        @Override
        protected void updateItem(String item, boolean empty) {
            super.updateItem(item, empty);
            if (empty || item == null) { setText(null); setStyle(null); return; }
            setText(item);
            setStyle("-fx-background-color:transparent;-fx-text-fill:#f8fafc;"
                   + "-fx-font-family:Consolas,'Courier New',monospace;-fx-font-size:12;"
                   + "-fx-padding:0;-fx-line-spacing:0;");
        }
    }

    private static final class FileStatusCell extends ListCell<FileStatus> {
        @Override
        protected void updateItem(FileStatus item, boolean empty) {
            super.updateItem(item, empty);
            if (empty || item == null) { setGraphic(null); setText(null); return; }

            HBox row = new HBox(6);
            row.setAlignment(Pos.CENTER_LEFT);

            Label nameLabel = new Label(item.getPath());
            nameLabel.setStyle("-fx-text-fill:#f8fafc;-fx-font-size:12;");
            HBox.setHgrow(nameLabel, Priority.ALWAYS);

            FileStatus.Code code = displayCode(item);
            char sym   = symbol(code);
            String col = color(code);
            Label badge = new Label(String.valueOf(sym));
            badge.setStyle("-fx-text-fill:" + col + ";-fx-font-weight:bold;-fx-font-size:10;"
                    + "-fx-background-color:" + col + "22;-fx-padding:1 5 1 5;"
                    + "-fx-background-radius:3;");

            row.getChildren().addAll(nameLabel, badge);
            setGraphic(row);
            setText(null);
            setStyle("-fx-padding:3 8 3 12;");
        }

        private static FileStatus.Code displayCode(FileStatus fs) {
            if (fs.getX() == FileStatus.Code.UNTRACKED) return FileStatus.Code.ADDED;
            if (fs.getX() != FileStatus.Code.NONE)      return fs.getX();
            return fs.getY();
        }

        private static char symbol(FileStatus.Code code) {
            return switch (code) {
                case MODIFIED  -> 'M';
                case ADDED     -> 'A';
                case DELETED   -> 'D';
                case RENAMED   -> 'R';
                case COPIED    -> 'C';
                default        -> '?';
            };
        }

        private static String color(FileStatus.Code code) {
            return switch (code) {
                case MODIFIED  -> "#0ea5e9";
                case ADDED     -> "#3fb950";
                case DELETED   -> "#f43f5e";
                case RENAMED   -> "#00f0ff";
                case COPIED    -> "#00f0ff";
                default        -> "#94a3b8";
            };
        }
    }
}

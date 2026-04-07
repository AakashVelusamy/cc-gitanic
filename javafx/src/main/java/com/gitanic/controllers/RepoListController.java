package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.AppState;
import com.gitanic.EventBus;
import com.gitanic.models.Repository;
import com.gitanic.services.NetworkService;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;

import java.io.File;
import java.util.List;
import java.util.function.Consumer;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Repository list screen with card-based layout.
 *
 * <p>Each repository is rendered as a rich card with action buttons for
 * cloning, opening locally, and deleting.
 */
public class RepoListController {

    private static final Logger LOG = Logger.getLogger(RepoListController.class.getName());

    @FXML private Label              welcomeLabel;
    @FXML private VBox               repoCardsContainer;
    @FXML private TextField          manualUrlField;
    @FXML private Label              statusLabel;
    @FXML private ProgressIndicator  loadingIndicator;

    /**
     * Called by the JavaFX runtime after FXML injection.
     * Sets the welcome label and triggers the initial repository load.
     */
    @FXML
    public void initialize() {
        AppState state = AppState.getInstance();
        welcomeLabel.setText("Welcome back, "
                + (state.getCurrentUser() != null ? state.getCurrentUser().getUsername() : ""));
        statusLabel.setVisible(false);
        loadingIndicator.setVisible(true);
        loadRepos();
    }

    // ---- Repo loading ------------------------------------------------

    private void loadRepos() {
        runAsync(() -> NetworkService.getInstance().getRepositories(),
            repos -> {
                loadingIndicator.setVisible(false);
                renderCards(repos);
                if (repos.isEmpty()) showStatus("No repositories yet. Create one below.", false);
            },
            err -> {
                loadingIndicator.setVisible(false);
                showStatus("Could not load repositories: " + err, true);
            }
        );
    }

    private void renderCards(List<Repository> repos) {
        repoCardsContainer.getChildren().clear();
        for (Repository repo : repos) {
            repoCardsContainer.getChildren().add(buildCard(repo));
        }
    }

    // ---- Card builder -----------------------------------------------

    private Node buildCard(Repository repo) {
        VBox card = new VBox(10);
        card.getStyleClass().add("repo-card");

        // Row 1: name + badges
        HBox row1 = new HBox(10);
        row1.setAlignment(Pos.CENTER_LEFT);

        Label nameLabel = new Label(repo.getName());
        nameLabel.getStyleClass().add("repo-card-name");

        if (repo.isAutoDeployEnabled()) {
            Label badge = new Label("AUTO-DEPLOY");
            badge.getStyleClass().add("badge-success");
            row1.getChildren().addAll(nameLabel, badge);
        } else {
            row1.getChildren().add(nameLabel);
        }

        if (repo.hasActiveDeployment()) {
            Label live = new Label("\u25CF LIVE");  // ● LIVE
            live.getStyleClass().add("badge-live");
            row1.getChildren().add(live);
        }

        Region spacer1 = new Region();
        HBox.setHgrow(spacer1, Priority.ALWAYS);
        row1.getChildren().add(spacer1);

        // Created date (right-aligned)
        if (repo.getCreatedAt() != null) {
            String date = repo.getCreatedAt().length() >= 10
                    ? repo.getCreatedAt().substring(0, 10) : repo.getCreatedAt();
            Label dateLabel = new Label(date);
            dateLabel.getStyleClass().add("card-meta");
            row1.getChildren().add(dateLabel);
        }

        // Row 2: git URL
        Label urlLabel = new Label(repo.getGitUrl());
        urlLabel.getStyleClass().add("repo-card-url");
        urlLabel.setMaxWidth(Double.MAX_VALUE);

        // Row 3: action buttons
        HBox actions = new HBox(6);
        actions.setAlignment(Pos.CENTER_LEFT);

        Button cloneBtn = cardButton("\u2B07 Clone", "card-btn-default",
                e -> doClone(repo));
        Button openBtn  = cardButton("\uD83D\uDCC2 Open Local", "card-btn-default",
                e -> doOpen(repo));

        Region spacer2 = new Region();
        HBox.setHgrow(spacer2, Priority.ALWAYS);

        Button deleteBtn = cardButton("Delete", "card-btn-danger",
                e -> doDelete(repo));

        actions.getChildren().addAll(cloneBtn, openBtn, spacer2, deleteBtn);
        card.getChildren().addAll(row1, urlLabel, actions);
        return card;
    }

    private Button cardButton(String text, String styleClass,
            javafx.event.EventHandler<javafx.event.ActionEvent> handler) {
        Button btn = new Button(text);
        btn.getStyleClass().addAll("card-btn", styleClass);
        btn.setOnAction(handler);
        return btn;
    }

    // ---- Card actions ------------------------------------------------

    private void doClone(Repository repo) {
        AppState.getInstance().setSelectedRepo(repo);
        AppState.getInstance().setOverrideCloneUrl(null);
        App.setRoot("CloneScreen");
    }

    private void doOpen(Repository repo) {
        DirectoryChooser chooser = new DirectoryChooser();
        chooser.setTitle("Open Local Repository for: " + repo.getName());
        chooser.setInitialDirectory(new File(System.getProperty("user.home")));
        File dir = chooser.showDialog(App.getPrimaryStage());
        if (dir != null) {
            if (!new File(dir, ".git").exists()) {
                showStatus("Not a git repository (.git not found).", true);
                return;
            }
            AppState.getInstance().setSelectedRepo(repo);
            AppState.getInstance().setCurrentRepoDir(dir);
            App.setRoot("WorkspaceScreen");
        }
    }

    private void doDelete(Repository repo) {
        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.setTitle("Delete Repository");
        confirm.setHeaderText("Delete \"" + repo.getName() + "\"?");
        confirm.setContentText(
                "This will permanently delete the repository and all its deployments.\n"
                + "This cannot be undone.");
        styleDialog(confirm);

        confirm.showAndWait().ifPresent(btn -> {
            if (btn == ButtonType.OK) {
                runAsync(
                    () -> {
                        NetworkService.getInstance().deleteRepository(repo.getName());
                        return null;
                    },
                    ignored -> {
                        showStatus("Repository deleted.", false);
                        loadRepos();
                    },
                    err -> showStatus("Delete failed: " + err, true));
            }
        });
    }

    // ---- Toolbar actions --------------------------------------------

    /**
     * Uses the URL in {@link #manualUrlField} as an override clone URL and
     * navigates to the CloneScreen.
     */
    @FXML
    protected void onUseUrlClicked() {
        String url = manualUrlField.getText().trim();
        if (url.isEmpty()) {
            showStatus("Paste a .git URL first.", true);
            return;
        }
        AppState.getInstance().setOverrideCloneUrl(url);
        AppState.getInstance().setSelectedRepo(null);
        App.setRoot("CloneScreen");
    }

    /**
     * Refreshes the repository list from the server.
     */
    @FXML
    protected void onRefreshClicked() {
        statusLabel.setVisible(false);
        loadingIndicator.setVisible(true);
        repoCardsContainer.getChildren().clear();
        loadRepos();
    }

    /**
     * Logs the current user out and navigates to the login screen.
     */
    @FXML
    protected void onLogoutClicked() {
        AppState.getInstance().logout();
        EventBus.getInstance().publish(EventBus.Event.LOGOUT);
        App.setRoot("LoginScreen");
    }

    // ---- Helpers ----------------------------------------------------

    private void showStatus(String msg, boolean isError) {
        statusLabel.setText(msg);
        statusLabel.setStyle(isError
                ? "-fx-text-fill: #ff4d6d;"
                : "-fx-text-fill: #3fb950;");
        statusLabel.setVisible(true);
    }

    private void styleDialog(Dialog<?> dialog) {
        try {
            dialog.getDialogPane().getScene().getStylesheets().add(
                    App.class.getResource("/css/dark-theme.css").toExternalForm());
        } catch (Exception ignored) {
            // Non-critical — dialog still functions without the stylesheet
        }
    }

    @FunctionalInterface
    private interface ThrowingSupplier<T> {
        /** Computes a result, potentially throwing a checked exception. */
        T get() throws Exception;
    }

    /**
     * Runs {@code task} on a background daemon thread.
     * On success, invokes {@code onSuccess} on the JavaFX Application Thread.
     * On any exception, invokes {@code onError} with the error message.
     *
     * @param <T>       the result type
     * @param task      the background task
     * @param onSuccess callback invoked with the task result on success
     * @param onError   callback invoked with the error message on failure
     */
    private <T> void runAsync(ThrowingSupplier<T> task,
                               Consumer<T> onSuccess,
                               Consumer<String> onError) {
        Thread t = new Thread(() -> {
            try {
                T result = task.get();
                Platform.runLater(() -> onSuccess.accept(result));
            } catch (Exception e) {
                LOG.log(Level.WARNING, "Background task failed", e);
                String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                Platform.runLater(() -> onError.accept(msg));
            }
        });
        t.setDaemon(true);
        t.start();
    }
}

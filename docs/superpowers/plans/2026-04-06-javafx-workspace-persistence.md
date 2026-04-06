# JavaFX Workspace Persistence & Clone Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix clone → card visibility, add a persistent workspace folder (scanned for repo cards), persist login session across restarts, enable double-click to open repos, and remove all placeholder texts.

**Architecture:** `AppState` gains `saveSession()`/`restoreSession()`/`clearSavedSession()` backed by `java.util.prefs.Preferences`. `App.start()` checks the restored session to decide the startup screen. `CloneController` is refactored to own a single persisted workspace folder (scanned on load) instead of a per-path list; the clone form drops the path field and always writes into the workspace folder.

**Tech Stack:** JavaFX 17, Maven, `java.util.prefs.Preferences` (already used in CloneController for repo list)

---

## File Map

| File | Change |
|------|--------|
| `javafx/src/main/java/com/gitanic/AppState.java` | Add `saveSession()`, `restoreSession()`, `clearSavedSession()` + call `clearSavedSession()` from `logout()` |
| `javafx/src/main/java/com/gitanic/App.java` | Call `restoreSession()` in `start()` to pick the initial screen |
| `javafx/src/main/java/com/gitanic/services/NetworkService.java` | Call `AppState.saveSession()` after successful login |
| `javafx/src/main/java/com/gitanic/controllers/CloneController.java` | Replace per-path list with workspace-folder scan; drop path field; double-click to open; re-render after clone |
| `javafx/src/main/resources/fxml/CloneScreen.fxml` | Replace section-bar "Open Folder" with workspace label + "Change..." button; remove path field + browse button from clone form |
| `javafx/src/main/resources/fxml/LoginScreen.fxml` | Remove empty `promptText=""` attrs |
| `javafx/src/main/resources/fxml/RepoListScreen.fxml` | Remove `promptText` from manualUrlField |
| `javafx/src/main/resources/fxml/WorkspaceScreen.fxml` | Remove `promptText="Commit message..."` |
| `javafx/src/main/resources/fxml/RegisterScreen.fxml` | Remove all `promptText` attrs |
| `javafx/src/main/resources/fxml/CommitScreen.fxml` | Remove `promptText` from messageField |

---

## Task 1: Session persistence in AppState

**Files:**
- Modify: `javafx/src/main/java/com/gitanic/AppState.java`

- [ ] **Step 1: Add imports and session-persistence methods to AppState**

Add `import java.util.prefs.Preferences;` at the top. Add the three methods and wire `logout()`:

```java
// ---- Session persistence ------------------------------------------

private static final String SESSION_NODE = "com/gitanic/session";

/**
 * Persists current user + credentials to OS keystore (java.util.prefs).
 * Called after every successful login so the app can auto-restore.
 */
public void saveSession() {
    Preferences prefs = Preferences.userRoot().node(SESSION_NODE);
    if (currentUser != null) {
        prefs.put("username", currentUser.getUsername());
        prefs.put("token",    currentUser.getToken() != null ? currentUser.getToken() : "");
        prefs.put("password", password != null ? password : "");
        prefs.put("apiUrl",   apiBaseUrl);
    }
}

/**
 * Restores a previously saved session into AppState.
 * Returns true if a valid session was found (username + token present).
 * App.start() calls this to decide the startup screen.
 */
public boolean restoreSession() {
    Preferences prefs = Preferences.userRoot().node(SESSION_NODE);
    String username = prefs.get("username", "");
    String token    = prefs.get("token",    "");
    String pwd      = prefs.get("password", "");
    String apiUrl   = prefs.get("apiUrl",   "http://localhost:3000/api");
    if (username.isEmpty() || token.isEmpty()) return false;
    setApiBaseUrl(apiUrl);
    currentUser = new User(username, token);
    password    = pwd.isEmpty() ? null : pwd;
    return true;
}

/** Removes all saved session data. Called from logout(). */
public void clearSavedSession() {
    try {
        Preferences.userRoot().node(SESSION_NODE).removeNode();
    } catch (Exception ignored) {}
}
```

- [ ] **Step 2: Call `clearSavedSession()` from `logout()`**

In the existing `logout()` method, add the call as the first line:

```java
public void logout() {
    clearSavedSession();   // ← add this line
    currentUser    = null;
    password       = null;
    selectedRepo   = null;
    currentRepoDir = null;
    currentBranch  = "main";
    overrideCloneUrl = null;
}
```

- [ ] **Step 3: Build to confirm no compile errors**

```bash
cd javafx && mvn compile -q
```

Expected: `BUILD SUCCESS`

---

## Task 2: Save session after login

**Files:**
- Modify: `javafx/src/main/java/com/gitanic/services/NetworkService.java`

- [ ] **Step 1: Call `saveSession()` in `NetworkService.login()` after state is set**

Find the block that sets `currentUser` and `password`, and add `state.saveSession()` immediately after:

```java
// existing code in login():
User user = new User(username, token);
AppState state = AppState.getInstance();
state.setCurrentUser(user);
state.setPassword(password);
state.saveSession();   // ← add this line
return user;
```

- [ ] **Step 2: Build**

```bash
cd javafx && mvn compile -q
```

Expected: `BUILD SUCCESS`

---

## Task 3: Auto-login on app startup

**Files:**
- Modify: `javafx/src/main/java/com/gitanic/App.java`

- [ ] **Step 1: Replace the hard-coded `"LoginScreen"` start with a session check**

Replace the `start()` method body to call `restoreSession()` before building the scene:

```java
@Override
public void start(Stage stage) throws IOException {
    primaryStage = stage;

    AppState state = AppState.getInstance();
    String startScreen = state.restoreSession() ? "CloneScreen" : "LoginScreen";

    scene = new Scene(loadFXML(startScreen), 1100, 720);

    URL css = App.class.getResource("/css/dark-theme.css");
    if (css != null) {
        scene.getStylesheets().add(css.toExternalForm());
    }

    stage.setTitle("Gitanic Desktop");
    stage.setMinWidth(800);
    stage.setMinHeight(550);
    stage.setScene(scene);
    stage.show();
}
```

- [ ] **Step 2: Build**

```bash
cd javafx && mvn compile -q
```

Expected: `BUILD SUCCESS`

- [ ] **Step 3: Manual smoke test — login persists across restart**

  1. `mvn javafx:run`, log in with valid credentials → lands on CloneScreen
  2. Close the window
  3. `mvn javafx:run` again → should land directly on CloneScreen (skip LoginScreen)
  4. Click Logout → lands on LoginScreen; close and reopen → should show LoginScreen again

---

## Task 4: Refactor CloneController — workspace folder + scan

**Files:**
- Modify: `javafx/src/main/java/com/gitanic/controllers/CloneController.java`

- [ ] **Step 1: Replace the full CloneController implementation**

Replace the entire file content with the following. Key changes from the old version:
- Removes per-path `PREFS_KEY` list and `getSavedRepoPaths()`/`rememberRepoPath()`/`forgetRepoPath()`
- Adds `PREFS_KEY_WORKSPACE`, `getWorkspaceDir()`, `setWorkspaceDir()`
- `renderLocalRepos()` now calls `scanWorkspace()` instead of reading a list
- `buildRepoCard()` uses double-click to open, removes Open/Remove buttons
- `onCloneClicked()` no longer reads `pathField` — uses `getWorkspaceDir()` directly
- After clone: calls `renderLocalRepos()` before navigating to WorkspaceScreen
- Removes `pathField`, `browseButton` fields (removed from FXML in Task 5)
- Adds `workspaceFolderLabel` and `onChangeFolderClicked()`

```java
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
        GitCommandService git     = GitCommandService.getInstance();
        String            repoName  = dir.getName();
        String            remoteUrl = git.getRemoteUrl(dir).trim();

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

                File repoDir = new File(workspace, repoName);
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
```

- [ ] **Step 2: Build**

```bash
cd javafx && mvn compile -q
```

Expected: `BUILD SUCCESS`

---

## Task 5: Update CloneScreen.fxml

**Files:**
- Modify: `javafx/src/main/resources/fxml/CloneScreen.fxml`

- [ ] **Step 1: Replace CloneScreen.fxml with the updated layout**

Key changes:
- Section bar: "Local Repositories" grows, then `workspaceFolderLabel` (truncated), then "Change..." button — replaces the old "Open Folder..." button
- Clone form: URL field only; path field + browse button removed; "Open Folder..." button stays in the bar for opening repos outside workspace
- All `promptText` attrs removed

```xml
<?xml version="1.0" encoding="UTF-8"?>
<?import javafx.scene.layout.BorderPane?>
<?import javafx.scene.layout.VBox?>
<?import javafx.scene.layout.HBox?>
<?import javafx.scene.layout.Region?>
<?import javafx.scene.control.Label?>
<?import javafx.scene.control.TextField?>
<?import javafx.scene.control.Button?>
<?import javafx.scene.control.ProgressBar?>
<?import javafx.scene.control.ScrollPane?>
<?import javafx.scene.control.Separator?>
<?import javafx.geometry.Insets?>
<?import javafx.scene.image.ImageView?>
<?import javafx.scene.image.Image?>

<BorderPane xmlns="http://javafx.com/javafx/17"
            xmlns:fx="http://javafx.com/fxml/1"
            fx:controller="com.gitanic.controllers.CloneController"
            styleClass="screen-root">

    <!-- App bar -->
    <top>
        <HBox styleClass="app-bar" alignment="CENTER_LEFT" spacing="12">
            <padding><Insets top="10" right="20" bottom="10" left="20"/></padding>
            <ImageView fitWidth="32" fitHeight="32" preserveRatio="true">
                <Image url="@../images/logo.png"/>
            </ImageView>
            <Separator orientation="VERTICAL" styleClass="bar-sep"/>
            <Label fx:id="welcomeLabel" styleClass="app-bar-welcome"/>
            <Region HBox.hgrow="ALWAYS"/>
            <Button text="Logout" onAction="#onLogoutClicked" styleClass="danger-button"/>
        </HBox>
    </top>

    <!-- Center: Local repos grid + Clone form -->
    <center>
        <VBox spacing="0">

            <!-- Local repos section header -->
            <HBox alignment="CENTER_LEFT" spacing="8" styleClass="section-bar">
                <padding><Insets top="14" right="20" bottom="14" left="20"/></padding>
                <Label text="Local Repositories" styleClass="section-title"/>
                <Region HBox.hgrow="ALWAYS"/>
                <Label fx:id="workspaceFolderLabel" styleClass="muted-label"
                       maxWidth="320" HBox.hgrow="NEVER"/>
                <Button text="Change..." onAction="#onChangeFolderClicked" styleClass="toolbar-btn"/>
                <Button text="Open Folder..." onAction="#onOpenExistingClicked" styleClass="toolbar-btn"/>
            </HBox>

            <ScrollPane fitToWidth="true" VBox.vgrow="ALWAYS"
                        styleClass="cards-scroll" hbarPolicy="NEVER">
                <VBox fx:id="localReposContainer" spacing="10" styleClass="cards-container">
                    <padding><Insets top="16" right="20" bottom="16" left="20"/></padding>
                </VBox>
            </ScrollPane>

            <Separator/>

            <!-- Clone form -->
            <VBox styleClass="bottom-panel" spacing="10">
                <padding><Insets top="14" right="20" bottom="16" left="20"/></padding>

                <Label text="CLONE A REPOSITORY" styleClass="field-label"/>
                <HBox spacing="8">
                    <TextField fx:id="urlField" HBox.hgrow="ALWAYS"/>
                </HBox>

                <HBox spacing="10" alignment="CENTER_RIGHT">
                    <ProgressBar fx:id="progressBar" prefWidth="200" progress="-1"/>
                    <Label fx:id="statusLabel" wrapText="true" HBox.hgrow="ALWAYS"/>
                    <Button fx:id="cloneButton"
                            text="Clone"
                            onAction="#onCloneClicked"
                            styleClass="primary-button"/>
                </HBox>
            </VBox>
        </VBox>
    </center>

</BorderPane>
```

- [ ] **Step 2: Build and run a quick UI check**

```bash
cd javafx && mvn compile -q && mvn javafx:run
```

Verify:
- "Local Repositories" header shows workspace path label + "Change..." + "Open Folder..." on the right
- Clone form has only the URL field (no path/browse)
- Cards appear for any repo in the workspace folder
- Double-clicking a card opens WorkspaceScreen
- Cloning a repo navigates to WorkspaceScreen; pressing back button shows the new card

---

## Task 6: Remove all placeholder texts from FXMLs

**Files:**
- Modify: `javafx/src/main/resources/fxml/LoginScreen.fxml`
- Modify: `javafx/src/main/resources/fxml/RepoListScreen.fxml`
- Modify: `javafx/src/main/resources/fxml/WorkspaceScreen.fxml`
- Modify: `javafx/src/main/resources/fxml/RegisterScreen.fxml`
- Modify: `javafx/src/main/resources/fxml/CommitScreen.fxml`

- [ ] **Step 1: LoginScreen.fxml — remove empty promptText attrs**

Remove `promptText=""` from three fields (usernameField, passwordField, passwordVisibleField). Change:

```xml
<TextField fx:id="usernameField" promptText="" maxWidth="Infinity"/>
```
to:
```xml
<TextField fx:id="usernameField" maxWidth="Infinity"/>
```

```xml
<PasswordField fx:id="passwordField" promptText="" maxWidth="Infinity"/>
```
to:
```xml
<PasswordField fx:id="passwordField" maxWidth="Infinity"/>
```

```xml
<TextField fx:id="passwordVisibleField" promptText="" maxWidth="Infinity" visible="false" managed="false"/>
```
to:
```xml
<TextField fx:id="passwordVisibleField" maxWidth="Infinity" visible="false" managed="false"/>
```

- [ ] **Step 2: RepoListScreen.fxml — remove promptText from manualUrlField**

Change:
```xml
<TextField fx:id="manualUrlField"
           promptText="http://host/git/username/repo.git"
           HBox.hgrow="ALWAYS"/>
```
to:
```xml
<TextField fx:id="manualUrlField" HBox.hgrow="ALWAYS"/>
```

- [ ] **Step 3: WorkspaceScreen.fxml — remove promptText from commitMessageField**

Change:
```xml
<TextField fx:id="commitMessageField"
           promptText="Commit message..."
           HBox.hgrow="ALWAYS"/>
```
to:
```xml
<TextField fx:id="commitMessageField" HBox.hgrow="ALWAYS"/>
```

- [ ] **Step 4: RegisterScreen.fxml — remove all promptText attrs**

Change:
```xml
<TextField fx:id="usernameField" promptText="choose a username" maxWidth="Infinity"/>
```
to:
```xml
<TextField fx:id="usernameField" maxWidth="Infinity"/>
```

```xml
<PasswordField fx:id="passwordField" promptText="••••••••" maxWidth="Infinity"/>
```
to:
```xml
<PasswordField fx:id="passwordField" maxWidth="Infinity"/>
```

```xml
<PasswordField fx:id="confirmPasswordField" promptText="••••••••" maxWidth="Infinity"/>
```
to:
```xml
<PasswordField fx:id="confirmPasswordField" maxWidth="Infinity"/>
```

- [ ] **Step 5: CommitScreen.fxml — remove promptText from messageField**

Change:
```xml
<TextField fx:id="messageField" promptText="Enter commit message..."/>
```
to:
```xml
<TextField fx:id="messageField"/>
```

- [ ] **Step 6: Build final clean compile**

```bash
cd javafx && mvn compile -q
```

Expected: `BUILD SUCCESS`

- [ ] **Step 7: Commit all changes**

```bash
cd javafx && git add src/main/java/com/gitanic/AppState.java \
  src/main/java/com/gitanic/App.java \
  src/main/java/com/gitanic/services/NetworkService.java \
  src/main/java/com/gitanic/controllers/CloneController.java \
  src/main/resources/fxml/CloneScreen.fxml \
  src/main/resources/fxml/LoginScreen.fxml \
  src/main/resources/fxml/RepoListScreen.fxml \
  src/main/resources/fxml/WorkspaceScreen.fxml \
  src/main/resources/fxml/RegisterScreen.fxml \
  src/main/resources/fxml/CommitScreen.fxml && \
git commit -m "feat(javafx): workspace folder, clone card fix, session persistence, remove placeholders"
```

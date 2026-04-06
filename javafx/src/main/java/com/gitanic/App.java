package com.gitanic;

import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.stage.Stage;

import java.io.IOException;
import java.net.URL;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * JavaFX application entry point.
 *
 * <p>Responsible for loading FXML screens and managing the primary {@link Stage}.
 * Navigation between screens is done via {@link #setRoot(String)} or
 * {@link #setRootGetController(String)}.
 */
public class App extends Application {

    private static final Logger LOG = Logger.getLogger(App.class.getName());

    private static Scene scene;
    private static Stage primaryStage;

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
        try (var iconStream = App.class.getResourceAsStream("/assets/logo.png")) {
            if (iconStream != null) {
                stage.getIcons().add(new Image(iconStream));
            }
        }
        stage.setMinWidth(800);
        stage.setMinHeight(550);
        stage.setScene(scene);
        stage.show();
    }

    /**
     * Navigates to a different screen by FXML name.
     * Must be called on the JavaFX Application Thread.
     *
     * @param fxml the FXML file base name (without path or extension)
     */
    public static void setRoot(String fxml) {
        try {
            scene.setRoot(loadFXML(fxml));
            primaryStage.sizeToScene();
        } catch (IOException e) {
            LOG.log(Level.SEVERE, "Failed to load FXML screen: " + fxml, e);
        }
    }

    /**
     * Navigates to a different screen and returns the new screen's controller.
     * Must be called on the JavaFX Application Thread.
     *
     * @param <T>  the controller type
     * @param fxml the FXML file base name (without path or extension)
     * @return the newly loaded controller
     * @throws IOException if the FXML resource cannot be found or loaded
     */
    @SuppressWarnings("unchecked")
    public static <T> T setRootGetController(String fxml) throws IOException {
        FXMLLoader loader = new FXMLLoader(App.class.getResource("/fxml/" + fxml + ".fxml"));
        Parent root = loader.load();
        scene.setRoot(root);
        return loader.getController();
    }

    /**
     * Returns the primary application {@link Stage}.
     *
     * @return the primary stage
     */
    public static Stage getPrimaryStage() {
        return primaryStage;
    }

    /**
     * Application entry point (delegated to JavaFX launcher).
     *
     * @param args command-line arguments (unused)
     */
    public static void main(String[] args) {
        launch();
    }

    // ------------------------------------------------------------------ private

    private static Parent loadFXML(String fxml) throws IOException {
        FXMLLoader loader = new FXMLLoader(App.class.getResource("/fxml/" + fxml + ".fxml"));
        return loader.load();
    }
}

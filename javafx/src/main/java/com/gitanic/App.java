package com.gitanic;

import com.gitanic.AppState;
import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.stage.Stage;

import java.io.IOException;
import java.net.URL;

public class App extends Application {

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
        stage.getIcons().add(new Image(App.class.getResourceAsStream("/assets/logo.png")));
        stage.setMinWidth(800);
        stage.setMinHeight(550);
        stage.setScene(scene);
        stage.show();
    }

    /**
     * Navigate to a different screen by FXML name.
     */
    public static void setRoot(String fxml) {
        try {
            scene.setRoot(loadFXML(fxml));
            primaryStage.sizeToScene();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    /**
     * Navigate and return the controller for the newly loaded screen.
     */
    @SuppressWarnings("unchecked")
    public static <T> T setRootGetController(String fxml) throws IOException {
        FXMLLoader loader = new FXMLLoader(App.class.getResource("/fxml/" + fxml + ".fxml"));
        Parent root = loader.load();
        scene.setRoot(root);
        return loader.getController();
    }

    private static Parent loadFXML(String fxml) throws IOException {
        FXMLLoader loader = new FXMLLoader(App.class.getResource("/fxml/" + fxml + ".fxml"));
        return loader.load();
    }

    public static Stage getPrimaryStage() {
        return primaryStage;
    }

    public static void main(String[] args) {
        launch();
    }
}

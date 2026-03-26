package com.gitanic.controllers;

import com.gitanic.App;
import com.gitanic.models.Repository;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.fxml.FXML;
import javafx.scene.control.Button;
import javafx.scene.control.ListView;

import java.util.List;

public class RepoListController {

    @FXML private ListView<Repository> repoListView;
    @FXML private Button cloneButton;

    public static Repository selectedRepository;

    @FXML
    public void initialize() {
        cloneButton.setDisable(true);

        repoListView.getSelectionModel().selectedItemProperty().addListener((obs, oldSel, newSel) -> {
            boolean selected = newSel != null;
            cloneButton.setDisable(!selected);
            selectedRepository = newSel;
        });

        loadRepos();
    }

    private void loadRepos() {
        new Thread(() -> {
            try {
                List<Repository> repos = LoginController.networkService.getRepositories();
                Platform.runLater(() -> repoListView.setItems(FXCollections.observableArrayList(repos)));
            } catch (Exception e) {
                e.printStackTrace();
            }
        }).start();
    }

    @FXML
    protected void onCloneClicked() {
        if (selectedRepository != null) {
            App.setRoot("CloneScreen");
        }
    }
}

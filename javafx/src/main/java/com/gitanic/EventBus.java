package com.gitanic;

import javafx.application.Platform;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Simple in-process Observer / Publish-Subscribe bus.
 * All publish calls are dispatched on the JavaFX Application Thread.
 * Pattern: Observer / Singleton
 */
public final class EventBus {

    public enum Event {
        LOGIN_SUCCESS,
        LOGOUT,
        REPO_SELECTED,       // payload: Repository
        REPO_DIR_OPENED,     // payload: File (cloned/opened directory)
        WORKSPACE_REFRESH,   // no payload – tells WorkspaceController to reload
        BRANCH_CHANGED,      // payload: String (new branch name)
        OPERATION_STARTED,   // payload: String (description)
        OPERATION_DONE,      // payload: String (result message)
        OPERATION_FAILED     // payload: String (error message)
    }

    private static EventBus instance;

    private final Map<Event, List<Consumer<Object>>> subscribers =
            new EnumMap<>(Event.class);

    private EventBus() {}

    public static synchronized EventBus getInstance() {
        if (instance == null) {
            instance = new EventBus();
        }
        return instance;
    }

    // ---- Subscribe / Unsubscribe --------------------------------------

    public synchronized void subscribe(Event event, Consumer<Object> handler) {
        subscribers.computeIfAbsent(event, k -> new ArrayList<>()).add(handler);
    }

    public synchronized void unsubscribe(Event event, Consumer<Object> handler) {
        List<Consumer<Object>> list = subscribers.get(event);
        if (list != null) list.remove(handler);
    }

    // ---- Publish -------------------------------------------------------

    public void publish(Event event) {
        publish(event, null);
    }

    public void publish(Event event, Object payload) {
        List<Consumer<Object>> list;
        synchronized (this) {
            List<Consumer<Object>> raw = subscribers.get(event);
            list = raw != null ? new ArrayList<>(raw) : new ArrayList<>();
        }
        if (Platform.isFxApplicationThread()) {
            dispatch(list, payload);
        } else {
            Platform.runLater(() -> dispatch(list, payload));
        }
    }

    private void dispatch(List<Consumer<Object>> handlers, Object payload) {
        for (Consumer<Object> h : handlers) {
            try { h.accept(payload); } catch (Exception e) { e.printStackTrace(); }
        }
    }
}

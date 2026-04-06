package com.gitanic;

import javafx.application.Platform;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Simple in-process Observer / Publish-Subscribe bus.
 *
 * <p>All {@link #publish} calls are dispatched on the JavaFX Application Thread,
 * so subscribers can safely update UI components without wrapping in
 * {@link Platform#runLater}.
 *
 * <p>Pattern: Observer / Singleton (holder pattern — thread-safe without synchronised).
 */
public final class EventBus {

    private static final Logger LOG = Logger.getLogger(EventBus.class.getName());

    /** Events that can be published on the bus. */
    public enum Event {
        /** Fired after a successful login. No payload. */
        LOGIN_SUCCESS,
        /** Fired when the user logs out. No payload. */
        LOGOUT,
        /** Fired when a repository is selected. Payload: {@link com.gitanic.models.Repository}. */
        REPO_SELECTED,
        /** Fired when a local repo directory is opened. Payload: {@link java.io.File}. */
        REPO_DIR_OPENED,
        /** Tells WorkspaceController to reload. No payload. */
        WORKSPACE_REFRESH,
        /** Fired when the git branch changes. Payload: {@link String} (new branch name). */
        BRANCH_CHANGED,
        /** Fired when an async operation starts. Payload: {@link String} (description). */
        OPERATION_STARTED,
        /** Fired when an async operation succeeds. Payload: {@link String} (result message). */
        OPERATION_DONE,
        /** Fired when an async operation fails. Payload: {@link String} (error message). */
        OPERATION_FAILED
    }

    // ------------------------------------------------------------------ singleton

    private static final class Holder {
        static final EventBus INSTANCE = new EventBus();
    }

    private EventBus() {}

    /** Returns the singleton instance. */
    public static EventBus getInstance() {
        return Holder.INSTANCE;
    }

    // ------------------------------------------------------------------ state

    private final Map<Event, List<Consumer<Object>>> subscribers =
            new EnumMap<>(Event.class);

    // ---- Subscribe / Unsubscribe --------------------------------------

    /**
     * Subscribes {@code handler} to the given {@code event}.
     * The handler will be invoked on the JavaFX Application Thread.
     *
     * @param event   the event to subscribe to
     * @param handler the consumer to invoke when the event is published
     */
    public synchronized void subscribe(Event event, Consumer<Object> handler) {
        subscribers.computeIfAbsent(event, k -> new ArrayList<>()).add(handler);
    }

    /**
     * Removes {@code handler} from the subscriber list for the given {@code event}.
     *
     * @param event   the event to unsubscribe from
     * @param handler the consumer to remove
     */
    public synchronized void unsubscribe(Event event, Consumer<Object> handler) {
        List<Consumer<Object>> list = subscribers.get(event);
        if (list != null) list.remove(handler);
    }

    // ---- Publish -------------------------------------------------------

    /**
     * Publishes an event with no payload.
     *
     * @param event the event to publish
     */
    public void publish(Event event) {
        publish(event, null);
    }

    /**
     * Publishes an event with an optional payload.
     * Dispatches on the JavaFX Application Thread (directly if already on it,
     * or via {@link Platform#runLater} otherwise).
     *
     * @param event   the event to publish
     * @param payload the event payload (may be {@code null})
     */
    public void publish(Event event, Object payload) {
        List<Consumer<Object>> snapshot;
        synchronized (this) {
            List<Consumer<Object>> raw = subscribers.get(event);
            snapshot = raw != null ? new ArrayList<>(raw) : new ArrayList<>();
        }
        if (Platform.isFxApplicationThread()) {
            dispatch(snapshot, payload);
        } else {
            Platform.runLater(() -> dispatch(snapshot, payload));
        }
    }

    // ------------------------------------------------------------------ private

    /**
     * Invokes each handler with the given payload.
     * Exceptions thrown by individual handlers are logged but do not prevent
     * subsequent handlers from being invoked.
     *
     * @param handlers the list of handlers to invoke
     * @param payload  the event payload
     */
    private void dispatch(List<Consumer<Object>> handlers, Object payload) {
        for (Consumer<Object> h : handlers) {
            try {
                h.accept(payload);
            } catch (Exception e) {
                LOG.log(Level.WARNING, "EventBus handler threw an exception", e);
            }
        }
    }
}

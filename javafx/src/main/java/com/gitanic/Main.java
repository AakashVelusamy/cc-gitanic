package com.gitanic;

/**
 * Bootstrap entry point required by launch4j and some module systems.
 *
 * <p>JavaFX applications need a non-JavaFX main class when running from a
 * fat JAR packaged by Maven shade / launch4j, because the JavaFX runtime must
 * be initialised before the {@link javafx.application.Application} subclass is
 * loaded.  This class satisfies that requirement by delegating immediately to
 * {@link App#main(String[])}.
 */
public final class Main {

    private Main() {
        // Utility class — do not instantiate.
    }

    /**
     * Delegates to {@link App#main(String[])} to launch the JavaFX application.
     *
     * @param args command-line arguments (passed through unchanged)
     */
    public static void main(String[] args) {
        App.main(args);
    }
}

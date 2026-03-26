package com.gitanic.services;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.util.stream.Collectors;

public class GitCommandService {

    public String executeCommand(File directory, String... command) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(command);
        if (directory != null) {
            pb.directory(directory);
        }
        pb.redirectErrorStream(true);
        Process process = pb.start();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String output = reader.lines().collect(Collectors.joining("\n"));
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                throw new Exception("Command failed with exit code " + exitCode + ":\n" + output);
            }
            return output;
        }
    }

    public void clone(String repoUrl, File targetDir) throws Exception {
        executeCommand(targetDir.getParentFile(), "git", "clone", repoUrl, targetDir.getName());
    }

    public String status(File repoDir) throws Exception {
        return executeCommand(repoDir, "git", "status");
    }

    public String diff(File repoDir) throws Exception {
        return executeCommand(repoDir, "git", "diff");
    }

    public void addAll(File repoDir) throws Exception {
        executeCommand(repoDir, "git", "add", ".");
    }

    public void commit(File repoDir, String message) throws Exception {
        executeCommand(repoDir, "git", "commit", "-m", message);
    }

    public String push(File repoDir) throws Exception {
        return executeCommand(repoDir, "git", "push");
    }

    public String pull(File repoDir) throws Exception {
        return executeCommand(repoDir, "git", "pull");
    }
}

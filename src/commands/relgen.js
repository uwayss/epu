import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import process from "process"; // Required for process.cwd() and process.env

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function executeRelgenPy(projectRoot) {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.resolve(
      __dirname,
      "..",
      "lib",
      "python_scripts",
      "relgen.py"
    );

    console.log(
      `🐍 Executing Python script for release generation: ${pythonScriptPath}`
    );
    console.log(
      `   (This script will operate on the project at: ${projectRoot})`
    );
    console.log(
      `   (Ensure Python 3, 'google-generativeai' pip package, and GEMINI_API_KEY are set up.)`
    );

    const pythonExecutable =
      process.platform === "win32" ? "python" : "python3";

    const pythonProcess = spawn(pythonExecutable, [pythonScriptPath], {
      cwd: projectRoot,
      stdio: "inherit", // Allows interaction (e.g., for prompts from Python script)
      env: { ...process.env },
    });

    pythonProcess.on("close", (code) => {
      if (code === 0) {
        console.log("✅ relgen.py script finished successfully.");
        resolve();
      } else {
        console.error(`❌ relgen.py script exited with error code ${code}.`);
        reject(
          new Error(
            `Python script relgen.py failed with code ${code}. Check its output for details.`
          )
        );
      }
    });

    pythonProcess.on("error", (err) => {
      console.error(
        `❌ Failed to start relgen.py. Is '${pythonExecutable}' installed and in your PATH?`,
        err
      );
      reject(
        new Error(
          `Failed to start Python script: ${err.message}. Ensure Python 3 is installed and in PATH.`
        )
      );
    });
  });
}

export function register(program) {
  program
    .command("relgen")
    .description(
      "Runs Python script to increment Android versionCode in build.gradle & generate multi-language release notes."
    )
    .action(async () => {
      const projectRoot = process.cwd();
      try {
        await executeRelgenPy(projectRoot);
      } catch (error) {
        console.error(`❌ Error during 'relgen' command: ${error.message}`);
        process.exit(1);
      }
    });
}

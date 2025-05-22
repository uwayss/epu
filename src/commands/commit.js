import { GoogleGenAI } from "@google/genai";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import process from "process"; // Required for process.env

function getGeminiKey() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable not set.");
    process.exit(1);
  }
  return apiKey;
}

async function callGemini(message, model = "gemini-2.0-flash") {
  const ai = new GoogleGenAI({ apiKey: getGeminiKey() });
  const response = await ai.models.generateContent({
    model: model,
    contents: message,
  });
  return response.text;
}
function getDesktopPath() {
  if (process.platform === "win32") {
    return path.join(os.homedir(), "Desktop");
  } else {
    return path.join(os.homedir(), "Desktop");
  }
}

function generateFilename(prefix = "file") {
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, ""); // Make it more filename-friendly
  return `${prefix}_${timestamp}.txt`;
}

function getGitDiff() {
  try {
    // Get diff of staged changes. Use --cached.
    // If you want all uncommitted changes (staged and unstaged), remove --cached.
    const result = execSync("git diff --staged", { encoding: "utf-8" });
    if (!result.trim()) {
      console.log(
        "No staged changes found. To diff unstaged changes, consider modifying the git diff command."
      );
      return ""; // Return empty string for no diff
    }
    return result;
  } catch (error) {
    // If git diff --cached returns non-zero due to no staged changes, it might not be an "error" per se.
    // However, execSync throws on non-zero exit. Check stderr.
    if (error.stderr && error.stderr.includes("no staged changes")) {
      // Heuristic
      console.log("No staged changes to diff.");
      return "";
    }
    console.error(`Error getting git diff: ${error.message}`);
    if (error.stderr) console.error("Git stderr:", error.stderr);
    throw new Error(
      `Failed to get git diff. Is git installed and are you in a git repository? Details: ${error.message}`
    );
  }
}

async function ensureDesktopDirExists(desktopPath) {
  try {
    await fs.promises.mkdir(desktopPath, { recursive: true });
  } catch (e) {
    console.warn(
      `Warning: Could not create/access Desktop directory at ${desktopPath}. Files will be saved in a fallback directory. Error: ${e.message}`
    );
    const fallbackDir = path.join(process.cwd(), "epu_outputs");
    await fs.promises.mkdir(fallbackDir, { recursive: true });
    return fallbackDir;
  }
  return desktopPath;
}

async function saveOutput(content, filepath, type) {
  try {
    await fs.promises.writeFile(filepath, content);
    console.log(`${type} saved to: ${filepath}`);
  } catch (error) {
    console.error(`Error saving ${type}: ${error.message}`);
  }
}

async function generateCommitMessage(diffContent) {
  if (!diffContent.trim()) {
    return "No changes to summarize.";
  }
  const message = `Analyze the following git diff and write a concise, well-structured git commit message (without markdown code blocks like \`\`\`). The format should be:

A short, descriptive title (under 70 characters) on the first line.
A blank line.
A bulleted list summarizing all key changes and their purpose. Each bullet point should be concise.

Focus on user-facing changes or significant internal improvements.
Do NOT include any "\`\`\`" delimiters around the commit message itself.

Git Diff:
${diffContent}`;
  return await callGemini(message);
}

async function executeGitAi(options) {
  let desktopPath = getDesktopPath();
  desktopPath = await ensureDesktopDirExists(desktopPath); // Ensure it exists or get fallback

  const diffContent = getGitDiff();

  if (!diffContent && options.saveDiff) {
    console.log("No git changes to save.");
  } else if (diffContent && options.saveDiff) {
    const diffFilename = generateFilename("git_diff");
    await saveOutput(
      diffContent,
      path.join(desktopPath, diffFilename),
      "Git diff"
    );
  }

  if (!diffContent) {
    console.log("No diff content to generate a commit message from.");
    return;
  }

  const commitMessage = await generateCommitMessage(diffContent);

  if (commitMessage) {
    console.log(
      "\n🤖 Generated Commit Message:\n--------------------------\n" +
        commitMessage +
        "\n--------------------------"
    );
    if (options.saveMsg) {
      const msgFilename = generateFilename("commit_message");
      await saveOutput(
        commitMessage,
        path.join(desktopPath, msgFilename),
        "Commit message"
      );
    }
  } else {
    console.log("Failed to generate commit message or no changes found.");
  }
}

export function register(program) {
  program
    .command("commit")
    .description("Generate a commit message from STAGED git diff using AI.")
    .option("--save-diff", "Save the git diff to a file (Desktop or fallback).")
    .option(
      "--save-msg",
      "Save the commit message to a file (Desktop or fallback)."
    )
    .action(async (cmdOptions) => {
      try {
        await executeGitAi(cmdOptions);
      } catch (error) {
        console.error(`❌ Error during 'commit' command: ${error.message}`);
        process.exit(1);
      }
    });
}

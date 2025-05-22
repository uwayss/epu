import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"; // Added mkdirSync
import path from "path";
import process from "process"; // Required for process.cwd()

const VERSION_CODE_FILE_NAME = "versionCode.txt"; // Just the filename

function getNextVersionCode(projectRoot) {
  const versionCodeFilePath = path.join(projectRoot, VERSION_CODE_FILE_NAME);
  let currentVersionCode = 0;

  if (existsSync(versionCodeFilePath)) {
    try {
      const fileContent = readFileSync(versionCodeFilePath, "utf-8").trim();
      if (fileContent) {
        // Check if file is not empty
        currentVersionCode = parseInt(fileContent, 10);
        if (isNaN(currentVersionCode)) {
          console.warn(
            `⚠️ Warning: ${versionCodeFilePath} contains an invalid number ('${fileContent}'). Resetting to 0.`
          );
          currentVersionCode = 0;
        }
      } else {
        console.log(
          `ℹ️ ${versionCodeFilePath} is empty. Initializing version code to 0.`
        );
        currentVersionCode = 0;
      }
    } catch (error) {
      console.error(
        `❌ Error reading ${versionCodeFilePath}: ${error.message}. Assuming version code 0.`
      );
      currentVersionCode = 0;
    }
  } else {
    console.log(
      `ℹ️ ${versionCodeFilePath} not found. Creating it and starting version code at 0.`
    );
  }

  const nextVersionCode = currentVersionCode + 1;
  try {
    writeFileSync(versionCodeFilePath, nextVersionCode.toString(), "utf-8");
    console.log(
      `✅ Version code in ${versionCodeFilePath} incremented from ${currentVersionCode} to ${nextVersionCode}`
    );
  } catch (error) {
    console.error(
      `❌ Error writing to ${versionCodeFilePath}: ${error.message}`
    );
    throw error; // Re-throw to be caught by the command handler
  }
  return nextVersionCode;
}

async function executePrepBuild(projectRoot) {
  console.log("⚙️  Starting local build preparation...");

  const newVersionCode = getNextVersionCode(projectRoot);

  console.log(
    `🚀 Running 'expo prebuild' with BUILD_NUMBER=${newVersionCode}...`
  );
  try {
    // Ensure npx is used, and it's generally good practice to explicitly use it for CLI tools from node_modules
    execSync(`npx expo prebuild --platform android --clean`, {
      stdio: "inherit",
      cwd: projectRoot,
      env: { ...process.env, BUILD_NUMBER: newVersionCode.toString() }, // Pass BUILD_NUMBER as env var
    });
    console.log("✅ Expo prebuild completed successfully!");
  } catch (error) {
    console.error(`❌ Error during expo prebuild: ${error.message}`);
    console.error(
      "   Please ensure you have Expo CLI installed (e.g., `npm install -g expo-cli` or via project dependencies)\n" +
        "   and that you are in a valid Expo project directory."
    );
    process.exit(1); // Critical failure for this command
  }

  console.log(
    `\n---------------------------------------------------------------------`
  );
  console.log(
    `🎉 SUCCESS! Your Android native project has been updated with versionCode (BUILD_NUMBER): ${newVersionCode}.`
  );
  console.log(
    `   You can now proceed to build your .aab bundle (e.g., using Android Studio or \`cd android && ./gradlew bundleRelease\`).`
  );
  console.log(
    `---------------------------------------------------------------------`
  );
}

export function register(program) {
  program
    .command("prep-build")
    .description(
      "Increments Android versionCode in project_root/versionCode.txt and runs `npx expo prebuild --platform android --clean`."
    )
    .action(async () => {
      const projectRoot = process.cwd();
      try {
        await executePrepBuild(projectRoot);
      } catch (error) {
        console.error(`❌ Error during 'prep-build' command: ${error.message}`);
        process.exit(1);
      }
    });
}

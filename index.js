#!/usr/bin/env node
import { program } from "commander";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const packageJsonPath = path.resolve("package.json");
let packageJson = {
  version: "0.0.0",
  description: "Expo Project Utilities CLI",
}; // Default values
try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
} catch (error) {
  console.warn(
    `Warning: Could not read package.json at ${packageJsonPath}. Using default version/description.`
  );
}

program
  .name("epu")
  .description(packageJson.description)
  .version(packageJson.version);

async function loadCommands() {
  const commandsDir = path.resolve("src", "commands");
  try {
    const commandFiles = fs
      .readdirSync(commandsDir)
      .filter((file) => file.endsWith(".js"));

    for (const file of commandFiles) {
      const commandFilePath = path.join(commandsDir, file);
      const commandFileUrl = pathToFileURL(commandFilePath).href;
      try {
        const commandModule = await import(commandFileUrl);
        if (
          commandModule.register &&
          typeof commandModule.register === "function"
        ) {
          commandModule.register(program);
        } else {
          console.warn(
            `⚠️  Warning: Command module ${file} does not export a 'register' function. Skipping.`
          );
        }
      } catch (err) {
        console.error(`❌ Error loading command from ${file}:`, err);
      }
    }
  } catch (err) {
    console.error(`❌ Error reading commands directory ${commandsDir}:`, err);
    process.exit(1);
  }
}

async function main() {
  await loadCommands();
  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

main().catch((err) => {
  console.error("❌ Unexpected CLI error:", err);
  process.exit(1);
});

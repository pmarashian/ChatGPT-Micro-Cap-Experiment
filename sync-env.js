#!/usr/bin/env node

/**
 * Environment file sync utility
 * Keeps .env.dev and .env.dev.json in sync
 */

const fs = require("fs");
const path = require("path");

const ENV_FILE = ".env.dev";
const ENV_JSON_FILE = ".env.dev.json";

function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};

  content.split("\n").forEach((line) => {
    line = line.trim();
    if (line && !line.startsWith("#")) {
      const [key, ...valueParts] = line.split("=");
      if (key && valueParts.length > 0) {
        let value = valueParts.join("=");
        // Remove surrounding quotes if present
        value = value.replace(/^["']|["']$/g, "");
        env[key] = value;
      }
    }
  });

  return env;
}

function loadJsonFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content);
}

function saveJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function saveEnvFile(filePath, data) {
  let content = "# Environment variables for Phase 1 (development)\n";
  content += "# Auto-generated from JSON file\n\n";

  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === "string") {
      content += `${key}="${value}"\n`;
    }
  });

  fs.writeFileSync(filePath, content);
}

function syncToJson() {
  console.log("🔄 Syncing .env.dev → .env.dev.json");
  const envData = loadEnvFile(ENV_FILE);
  saveJsonFile(ENV_JSON_FILE, envData);
  console.log("✅ Sync complete");
}

function syncToEnv() {
  console.log("🔄 Syncing .env.dev.json → .env.dev");
  const jsonData = loadJsonFile(ENV_JSON_FILE);
  saveEnvFile(ENV_FILE, jsonData);
  console.log("✅ Sync complete");
}

function showDiff() {
  console.log("🔍 Comparing environment files...\n");

  let envData = {};
  let jsonData = {};

  try {
    envData = loadEnvFile(ENV_FILE);
  } catch (e) {
    console.log("❌ Could not read .env.dev");
  }

  try {
    jsonData = loadJsonFile(ENV_JSON_FILE);
  } catch (e) {
    console.log("❌ Could not read .env.dev.json");
  }

  const allKeys = new Set([...Object.keys(envData), ...Object.keys(jsonData)]);

  let hasDiff = false;
  allKeys.forEach((key) => {
    const envValue = envData[key];
    const jsonValue = jsonData[key];

    if (envValue !== jsonValue) {
      hasDiff = true;
      console.log(`🔸 ${key}:`);
      console.log(`   .env.dev:     ${envValue || "(missing)"}`);
      console.log(`   .env.dev.json: ${jsonValue || "(missing)"}`);
      console.log();
    }
  });

  if (!hasDiff) {
    console.log("✅ Files are in sync!");
  }
}

// Main command handling
const command = process.argv[2];

switch (command) {
  case "to-json":
    syncToJson();
    break;
  case "to-env":
    syncToEnv();
    break;
  case "diff":
    showDiff();
    break;
  case "sync":
    // Sync both ways, preferring JSON as source of truth
    syncToEnv();
    break;
  default:
    console.log(`
🌍 Environment File Sync Utility

Usage:
  node sync-env.js <command>

Commands:
  to-json    Sync .env.dev → .env.dev.json
  to-env     Sync .env.dev.json → .env.dev
  diff       Show differences between files
  sync       Sync JSON → .env (recommended)

Examples:
  node sync-env.js diff
  node sync-env.js to-json
  node sync-env.js sync
`);
    break;
}

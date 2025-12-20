import path from "node:path";
import dotenv from "dotenv";

export function loadAgentEnvFiles(files = [".env", ".env.agents"]) {
  const cwd = process.cwd();
  files.forEach((file, index) => {
    dotenv.config({ path: path.resolve(cwd, file), override: index > 0 });
  });
}

export function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function normalizeBaseUrl(url) {
  const trimmed = url.trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid JIRA_URL: ${url}`);
  }

  return parsed.origin;
}

export function createBasicAuthHeader(username, apiToken) {
  if (!username) throw new Error("Missing Jira username.");
  if (!apiToken) throw new Error("Missing Jira API token.");
  return `Basic ${Buffer.from(`${username}:${apiToken}`).toString("base64")}`;
}

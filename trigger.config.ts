import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Project ref from Trigger.dev dashboard (Portfolio site)
  project: process.env.TRIGGER_PROJECT_REF || "proj_ogdkxvtjyxoitiaemibx",
  runtime: "node-22",
  logLevel: "log",
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./trigger"],
});

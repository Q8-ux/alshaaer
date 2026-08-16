import vinext from "vinext";
import { defineConfig } from "vite";

const requiredEnvironment = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required when building the Cloudflare deployment.`);
  }
  return value;
};

const workerName = process.env.CLOUDFLARE_WORKER_NAME || "ant-alshaer";
const databaseName = process.env.CLOUDFLARE_D1_DATABASE_NAME || "ant-alshaer-db";
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || "ant-alshaer-audio";

// Keep Wrangler and Miniflare metadata inside the project during local builds.
// This has no effect on production deployment credentials.
process.env.WRANGLER_WRITE_LOGS ??= "false";
process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

export default defineConfig(async () => {
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          name: workerName,
          compatibility_date: "2026-08-16",
          compatibility_flags: ["nodejs_compat"],
          main: "./worker/index.ts",
          workers_dev: true,
          assets: {
            not_found_handling: "none",
            binding: "ASSETS",
          },
          images: { binding: "IMAGES" },
          d1_databases: [
            {
              binding: "DB",
              database_name: databaseName,
              database_id: requiredEnvironment("CLOUDFLARE_D1_DATABASE_ID"),
            },
          ],
          r2_buckets: [
            {
              binding: "BUCKET",
              bucket_name: bucketName,
            },
          ],
          vars: {
            GUEST_ACCESS_ENABLED: "true",
          },
        },
      }),
    ],
  };
});

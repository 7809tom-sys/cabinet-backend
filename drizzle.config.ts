import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  // Keep all application table definitions visible to Drizzle. Pelican's
  // catalog lives separately because it is imported by the catalog pipeline.
  schema: ["./drizzle/schema.ts", "./drizzle/pelicanSchema.ts"],
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});

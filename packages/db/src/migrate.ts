import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const directory = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  const sql = postgres(url, { max: 1 });
  const file = path.join(directory, "migrations", "0001_init.sql");
  const contents = await readFile(file, "utf8");
  await sql.unsafe(contents);
  await sql.end();
  console.log("applied 0001_init.sql");
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});

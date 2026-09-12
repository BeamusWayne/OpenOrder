import { createDb } from "@openorder/db";
import { seedCatalog } from "./seed.js";

const db = createDb();
await seedCatalog(db);
console.log("seeded beverage catalog");
process.exit(0);

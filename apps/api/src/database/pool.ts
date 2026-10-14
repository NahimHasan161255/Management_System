import { Pool } from "pg";
import { environment } from "../config.js";

export const pool = new Pool({
  connectionString: environment.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

pool.on("error", (error: Error) => {
  console.error(JSON.stringify({
    level: "error",
    event: "database_pool_error",
    error: error.name
  }));
});

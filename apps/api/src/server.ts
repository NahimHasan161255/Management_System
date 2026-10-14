import "dotenv/config";
import { createApp } from "./app.js";
import { environment } from "./config.js";
import { pool } from "./database/pool.js";

const server = createApp(pool).listen(environment.API_PORT, environment.API_HOST, () => {
  console.info(JSON.stringify({
    level: "info",
    event: "api_started",
    host: environment.API_HOST,
    port: environment.API_PORT,
    environment: environment.NODE_ENV
  }));
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.info(JSON.stringify({ level: "info", event: "api_shutdown_started", signal }));

  server.close((serverError) => {
    void pool.end().then(() => {
      if (serverError) {
        console.error(JSON.stringify({
          level: "error",
          event: "api_shutdown_failed",
          error: serverError.name
        }));
        process.exitCode = 1;
        return;
      }

      console.info(JSON.stringify({ level: "info", event: "api_shutdown_complete" }));
    }).catch((error: unknown) => {
      console.error(JSON.stringify({
        level: "error",
        event: "database_pool_shutdown_failed",
        error: error instanceof Error ? error.name : "UnknownError"
      }));
      process.exitCode = 1;
    });
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

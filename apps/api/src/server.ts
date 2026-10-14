import "dotenv/config";
import { app } from "./app.js";
import { environment } from "./config.js";

app.listen(environment.API_PORT, environment.API_HOST, () => {
  console.info(JSON.stringify({
    level: "info",
    event: "api_started",
    host: environment.API_HOST,
    port: environment.API_PORT,
    environment: environment.NODE_ENV
  }));
});

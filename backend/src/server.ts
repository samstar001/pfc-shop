import { env } from "./config/env.js";
import { app } from "./app.js";

// Start listening for requests
app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
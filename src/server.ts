import app from "./app";
import { env } from "@shared/config/env";
import logger from "@shared/logger/logger";

app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT}`);
});
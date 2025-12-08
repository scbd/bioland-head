import { LOG_LEVEL } from "#shared/utils/constants";
import { configureLogger } from "#shared/utils/logger";

export default defineNuxtPlugin(() => {
  const { public: { logLevel } = {} } = useRuntimeConfig();

  configureLogger(logLevel ?? LOG_LEVEL.TRACE);
});

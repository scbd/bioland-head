import { createConsola } from "consola";
import { colorize } from "consola/utils";

export const consola = createConsola({
  level: 4, // Enable debug level
  reporters: [
    {
      log: (logObj) => {
        if (logObj.type === "debug") {
          // Use ANSI purple/magenta (code 35)
          console.log(`\x1b[35m[DEBUG]\x1b[0m`, ...logObj.args);
        } else {
          // Let the default handle other types
          console.log(`[${logObj.type.toUpperCase()}]`, ...logObj.args);
        }
      },
    },
  ],
});

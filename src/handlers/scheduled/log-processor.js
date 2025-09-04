const { Logtail } = require("@logtail/node");

// Load environment variables for offline development
if (process.env.IS_OFFLINE) {
  require("dotenv").config({
    path: ".env.dev",
  });
}

// Initialize Logtail
const logtail = new Logtail(process.env.LOGTAIL_API_KEY, {
  endpoint:
    process.env.LOGTAIL_ENDPOINT ||
    "https://s1469302.eu-nbg-2.betterstackdata.com",
});

/**
 * Lambda function that processes logs and sends them to Logtail
 */
module.exports.logProcessor = async (event) => {
  try {
    const { logs } = event;

    if (!logs || !Array.isArray(logs)) {
      console.error("Invalid logs data received");
      return;
    }

    // Check if Logtail is properly initialized
    if (!process.env.LOGTAIL_API_KEY) {
      console.warn("LOGTAIL_API_KEY not set, skipping log transmission");
      console.log(`Would have processed ${logs.length} log entries`);
      return;
    }

    // Process each log entry with timeout protection
    const processPromises = logs.map(async (log, index) => {
      const { dt, level, message, ...customFields } = log;

      try {
        // Send to Logtail with preserved timestamp and timeout
        const logLevel =
          level && typeof logtail[level] === "function" ? level : "info";
        await Promise.race([
          logtail[logLevel](message, { ...customFields, dt }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Log send timeout")), 5000)
          ),
        ]);
      } catch (logError) {
        console.error(
          `Failed to send log ${index + 1}/${logs.length} to Logtail:`,
          logError.message
        );
        // Continue processing other logs even if one fails
      }
    });

    // Wait for all logs to process (or fail) with overall timeout
    await Promise.race([
      Promise.allSettled(processPromises),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Overall processing timeout")), 25000)
      ),
    ]);

    // console.log("Logs processed:", logs);

    // console.log(`Successfully processed ${logs.length} log entries`);
  } catch (error) {
    console.error("Log processor error:", error.message);
  }
};

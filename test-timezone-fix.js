/**
 * Test script to verify the timezone fix for getNextRunTime function
 */

const moment = require("moment-timezone");
const cronParser = require("cron-parser");

// Copy the fixed getNextRunTime function for testing
function getNextRunTime(cronExpression, timezone = "America/New_York") {
  console.log("Getting next run time for", cronExpression, timezone);
  try {
    // Parse the cron expression to extract the schedule information
    const interval = cronParser.parseExpression(cronExpression);
    const fields = interval.fields;

    // Extract hour and minute from the cron expression
    const hour = fields.hour[0];
    const minute = fields.minute[0];

    console.log(
      `Cron expression ${cronExpression} parsed: hour=${hour}, minute=${minute}`
    );

    // Get current time in the target timezone
    const now = moment();
    const nowInTimezone = now.clone().tz(timezone);

    console.log(`Current time UTC: ${now.toISOString()}`);
    console.log(`Current time in ${timezone}: ${nowInTimezone.format()}`);

    // Create today's scheduled time in the target timezone
    let scheduledTime = nowInTimezone
      .clone()
      .hour(hour)
      .minute(minute)
      .second(0)
      .millisecond(0);

    console.log(
      `Today's scheduled time in ${timezone}: ${scheduledTime.format()}`
    );

    // If the scheduled time has already passed today, move to tomorrow
    if (
      scheduledTime.isBefore(nowInTimezone) ||
      scheduledTime.isSame(nowInTimezone)
    ) {
      scheduledTime = scheduledTime.add(1, "day");
      console.log(
        `Scheduled time moved to tomorrow: ${scheduledTime.format()}`
      );
    }

    // Convert the scheduled time back to UTC for storage
    const scheduledTimeUTC = scheduledTime.clone().utc();

    console.log(
      `${cronExpression} next run in ${timezone}: ${scheduledTime.format()}`
    );
    console.log(
      `${cronExpression} next run UTC: ${scheduledTimeUTC.toISOString()}`
    );

    return scheduledTimeUTC.toDate();
  } catch (error) {
    console.error(
      `Failed to parse cron expression "${cronExpression}": ${error.message}`,
      {
        cronExpression,
        timezone,
        error: error.message,
      }
    );

    // Fallback: return a time 1 hour from now in the specified timezone
    const fallback = moment().tz(timezone).add(1, "hour").startOf("hour");
    console.warn(`Using fallback schedule: ${fallback.format()}`, {
      cronExpression,
      timezone,
      fallbackTime: fallback.format(),
    });

    return fallback.toDate();
  }
}

// Test the problematic cron expression
console.log("=== Testing timezone fix for '30 20 * * ? America/New_York' ===");
const result = getNextRunTime("30 20 * * ?", "America/New_York");

console.log("\n=== Test Results ===");
console.log("Next run time:", result);
console.log("Next run time (ISO):", result.toISOString());

// Verify the result makes sense
const resultMoment = moment(result).tz("America/New_York");
console.log(`Result in America/New_York: ${resultMoment.format()}`);
console.log(
  `Result hour in ET: ${resultMoment.hour()}:${resultMoment
    .minute()
    .toString()
    .padStart(2, "0")}`
);

// The expected result should be around 8:30 PM ET
const expectedHour = 20; // 8 PM
const expectedMinute = 30;

if (
  resultMoment.hour() === expectedHour &&
  resultMoment.minute() === expectedMinute
) {
  console.log("✅ SUCCESS: Timezone fix is working correctly!");
} else {
  console.log("❌ FAILURE: Timezone fix is not working correctly");
  console.log(
    `Expected: ${expectedHour}:${expectedMinute.toString().padStart(2, "0")} ET`
  );
  console.log(
    `Got: ${resultMoment.hour()}:${resultMoment
      .minute()
      .toString()
      .padStart(2, "0")} ET`
  );
}

/**
 * Test Email API Handler
 * Sends a test email to verify SES configuration and email sending functionality
 */

const AWS = require("aws-sdk");
const Logger = require("../../utils/logger");
const ErrorHandler = require("../../utils/error-handler");
const { getEnvConfig } = require("../../config/environment");

class TestEmailHandler {
  constructor() {
    this.logger = new Logger("test-email-handler");
    this.errorHandler = new ErrorHandler("test-email-handler");
  }

  /**
   * Handle POST request for test email sending
   */
  async handle(event) {
    try {
      this.logger.info("Processing test email request");

      const envConfig = getEnvConfig();

      // Initialize SES
      const ses = new AWS.SES({ region: envConfig.sesRegion });

      // Get recipient from query params or use admin email as default
      const recipient =
        event.queryStringParameters?.recipient || envConfig.adminEmail;

      // Validate recipient email
      if (!recipient) {
        return {
          statusCode: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({
            error:
              "No recipient email provided. Set recipient query parameter or ADMIN_EMAIL environment variable.",
            timestamp: new Date().toISOString(),
          }),
        };
      }

      // Generate test email content
      const emailContent = this.generateTestEmailContent();

      // Send test email
      this.logger.info("Sending test email", { recipient });
      const result = await this.sendTestEmail(
        ses,
        envConfig,
        recipient,
        emailContent
      );

      this.logger.info("Test email sent successfully", {
        messageId: result.MessageId,
        recipient,
        sender: envConfig.sesSenderEmail,
      });

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: true,
          message: "Test email sent successfully",
          details: {
            messageId: result.MessageId,
            recipient,
            sender: envConfig.sesSenderEmail,
            subject: "Test Email - Trading System",
            timestamp: new Date().toISOString(),
          },
        }),
      };
    } catch (error) {
      this.logger.error("Failed to send test email", error);
      return this.errorHandler.createErrorResponse(
        new Error(
          `Failed to send test email: ${error.message}. Check SES configuration and email addresses are verified.`
        ),
        500
      );
    }
  }

  /**
   * Generate test email content
   */
  generateTestEmailContent() {
    const timestamp = new Date().toISOString();
    const subject = "Test Email - Trading System Verification";

    const body = `
🚀 Trading System - Email Test Successful!

This is a test email to verify that the email sending functionality is working correctly.

📊 Test Details:
- Timestamp: ${timestamp}
- System: ChatGPT Micro-Cap Trading Experiment
- Status: ✅ Email sending is functional

🎯 Next Steps:
- Your SES configuration is working properly
- Email alerts and reports can be sent
- Trading system notifications are ready

📧 If you received this email, everything is configured correctly!

---
Automated Test - No Action Required
Trading System Notification Service
    `.trim();

    return { subject, body };
  }

  /**
   * Send test email via SES
   */
  async sendTestEmail(ses, envConfig, recipient, emailContent) {
    const params = {
      Source: envConfig.sesSenderEmail,
      Destination: {
        ToAddresses: [recipient],
      },
      Message: {
        Subject: {
          Data: emailContent.subject,
        },
        Body: {
          Text: {
            Data: emailContent.body,
          },
        },
      },
    };

    try {
      const result = await ses.sendEmail(params).promise();
      this.logger.info("Test email sent successfully", {
        messageId: result.MessageId,
        recipient,
      });
      return result;
    } catch (error) {
      this.logger.error("Failed to send test email via SES", error);
      throw new Error(`SES email delivery failed: ${error.message}`);
    }
  }
}

// Main Lambda handler function
module.exports.handler = async (event, context) => {
  const handler = new TestEmailHandler();

  try {
    // Handle the request
    const response = await handler.handle(event);

    // Add CORS headers
    return {
      ...response,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        ...response.headers,
      },
    };
  } catch (error) {
    console.error("Handler error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};

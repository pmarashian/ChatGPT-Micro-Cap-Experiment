/**
 * Report Service
 * Persists human-readable daily/weekly AI reports to DynamoDB and retrieves them.
 */

const AWS = require("aws-sdk");
const Logger = require("../utils/logger");
const ErrorHandler = require("../utils/error-handler");
const { DYNAMODB_TABLES, ITEM_TYPES } = require("../config/constants");

class ReportService {
  constructor() {
    this.logger = new Logger("report-service");
    this.errorHandler = new ErrorHandler("report-service");

    this.dynamodb = new AWS.DynamoDB.DocumentClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    this.tableName =
      process.env.TRADING_TABLE_NAME || DYNAMODB_TABLES.TRADING_TABLE;
  }

  /**
   * Persist an AI report
   * @param {Object} params
   * @param {"daily"|"weekly"} params.period - Report period
   * @param {string} params.subject - Email/report subject line
   * @param {string} params.content - Markdown/text content
   * @param {Object} params.metadata - Optional metadata (e.g., counts, summary)
   */
  async saveReport({ period, subject, content, metadata = {} }) {
    const dateStr = new Date().toISOString().split("T")[0];
    const timestamp = new Date().toISOString();
    const pk = `${ITEM_TYPES.AI_REPORT}#${period}`;
    const sk = `${dateStr}`;

    const item = {
      PK: pk,
      SK: sk,
      itemType: ITEM_TYPES.AI_REPORT,
      period,
      subject,
      content,
      metadata,
      generatedAt: timestamp,
    };

    const params = {
      TableName: this.tableName,
      Item: item,
    };

    await this.dynamodb.put(params).promise();
    this.logger.info("Report saved", { period, date: sk });
    return item;
  }

  /**
   * Get a report by period and date (YYYY-MM-DD)
   */
  async getReport(period, dateStr) {
    const params = {
      TableName: this.tableName,
      Key: {
        PK: `${ITEM_TYPES.AI_REPORT}#${period}`,
        SK: dateStr,
      },
    };

    const result = await this.dynamodb.get(params).promise();
    return result.Item || null;
  }
}

module.exports = ReportService;

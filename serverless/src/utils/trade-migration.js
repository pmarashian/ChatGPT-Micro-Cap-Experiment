/**
 * Migration script to add GSI2 attributes to existing trade records
 * This ensures backward compatibility with the new TradeHistoryIndex GSI
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const Logger = require("./logger");
const { DYNAMODB_TABLES } = require("../config/constants");
const { getEnvConfig } = require("../config/environment");

/**
 * Migrate existing trade records to include GSI2 attributes
 */
async function migrateTradeRecords() {
  const logger = new Logger("trade-migration");
  const envConfig = getEnvConfig();

  // Initialize DynamoDB
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
  });
  const dynamodb = DynamoDBDocumentClient.from(client);

  const tableName =
    process.env.TRADING_TABLE_NAME || DYNAMODB_TABLES.TRADING_TABLE;

  try {
    logger.info("Starting trade records migration for GSI2 attributes");

    // Scan for all trade records that don't have GSI2PK
    const scanParams = {
      TableName: tableName,
      FilterExpression:
        "attribute_not_exists(GSI2PK) AND begins_with(PK, :tradePrefix)",
      ExpressionAttributeValues: {
        ":tradePrefix": "TRADE#",
      },
    };

    let lastEvaluatedKey;
    let totalMigrated = 0;
    let totalProcessed = 0;

    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await dynamodb.scan(scanParams).promise();
      lastEvaluatedKey = result.LastEvaluatedKey;

      if (result.Items.length > 0) {
        logger.info(`Found ${result.Items.length} trade records to migrate`);

        // Process items in batches
        const batchSize = 25;
        for (let i = 0; i < result.Items.length; i += batchSize) {
          const batch = result.Items.slice(i, i + batchSize);

          const updateRequests = batch.map((item) => ({
            PutRequest: {
              Item: {
                ...item,
                // Add GSI2 attributes for trade history queries
                GSI2PK: "ALL_TRADES",
                GSI2SK: `TRADE#${item.date}`,
              },
            },
          }));

          const batchWriteParams = {
            RequestItems: {
              [tableName]: updateRequests,
            },
          };

          try {
            await dynamodb.batchWrite(batchWriteParams).promise();
            totalMigrated += batch.length;
            logger.info(`Migrated batch of ${batch.length} trade records`);
          } catch (batchError) {
            logger.error("Error in batch migration", batchError);
            // Continue with next batch
          }
        }
      }

      totalProcessed += result.Items.length;
      logger.info(
        `Processed ${totalProcessed} trade records, migrated ${totalMigrated}`
      );
    } while (lastEvaluatedKey);

    logger.info(`Migration completed. Total migrated: ${totalMigrated}`);
    return { success: true, migrated: totalMigrated };
  } catch (error) {
    logger.error("Trade migration failed", error);
    throw new Error(`Trade migration error: ${error.message}`);
  }
}

/**
 * Verify migration by checking a sample of records
 */
async function verifyMigration() {
  const logger = new Logger("trade-migration-verify");
  const envConfig = getEnvConfig();

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
  });
  const dynamodb = DynamoDBDocumentClient.from(client);

  const tableName =
    process.env.TRADING_TABLE_NAME || DYNAMODB_TABLES.TRADING_TABLE;

  try {
    logger.info("Verifying trade records migration");

    // Query using the new GSI to verify it works
    const queryParams = {
      TableName: tableName,
      IndexName: "TradeHistoryIndex",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: {
        ":pk": "ALL_TRADES",
      },
      Limit: 5, // Just check a few records
    };

    const result = await dynamodb.query(queryParams).promise();

    if (result.Items.length > 0) {
      logger.info(
        `✅ Migration verified: Found ${result.Items.length} records in TradeHistoryIndex`
      );
      logger.info("Sample record:", {
        ticker: result.Items[0].ticker,
        date: result.Items[0].date,
        GSI2PK: result.Items[0].GSI2PK,
        GSI2SK: result.Items[0].GSI2SK,
      });
      return { success: true, verified: result.Items.length };
    } else {
      logger.warn(
        "⚠️  No records found in TradeHistoryIndex - migration may have failed"
      );
      return { success: false, verified: 0 };
    }
  } catch (error) {
    logger.error("Migration verification failed", error);
    throw new Error(`Migration verification error: ${error.message}`);
  }
}

module.exports = {
  migrateTradeRecords,
  verifyMigration,
};

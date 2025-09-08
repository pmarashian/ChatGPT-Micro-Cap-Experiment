/**
 * Get Orchestrator Locks API Handler
 * Returns all current orchestrator locks for debugging/monitoring
 */

const { validateEnvironment } = require("../../config/environment");
const { withApiHandlerLifecycle } = require("../../utils/handler-wrapper");
const {
  getAllOrchestratorLocks,
} = require("../../services/job-orchestration-service");

/**
 * Pure business logic for getting orchestrator locks
 */
const businessLogic = async ({ logger }) => {
  const locks = await getAllOrchestratorLocks(logger);

  // Format the response
  const formattedLocks = locks.map((lock) => ({
    executionId: lock.executionId,
    status: lock.status,
    acquiredAt: lock.acquiredAt,
    expiresAt: lock.expiresAt,
    releasedAt: lock.releasedAt,
    lockType: lock.lockType,
    isExpired: new Date(lock.expiresAt) < new Date(),
    ageMinutes: Math.round(
      (Date.now() - new Date(lock.acquiredAt)) / (1000 * 60)
    ),
  }));

  logger.info(`Retrieved ${formattedLocks.length} orchestrator locks`);

  return {
    success: true,
    locks: formattedLocks,
    total: formattedLocks.length,
    active: formattedLocks.filter((l) => l.status === "active" && !l.isExpired)
      .length,
    expired: formattedLocks.filter((l) => l.isExpired).length,
    released: formattedLocks.filter((l) => l.status === "released").length,
  };
};

module.exports.handler = withApiHandlerLifecycle(businessLogic, {
  handlerName: "get-orchestrator-locks",
  operation: "get_orchestrator_locks",
  validateEnvironment: validateEnvironment,
});

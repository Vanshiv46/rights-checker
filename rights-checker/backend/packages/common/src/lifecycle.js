const FORCE_EXIT_MS = 10_000;

/**
 * Graceful shutdown on SIGTERM/SIGINT: stop accepting HTTP, then close each dependency in order.
 * Unhandled rejections are logged and trigger the same shutdown instead of a silent crash.
 */
export function registerShutdown(server, closers, logger) {
  let shuttingDown = false;

  const shutdown = async (reason, exitCode) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'shutting down');
    setTimeout(() => process.exit(1), FORCE_EXIT_MS).unref();
    await new Promise((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
    for (const closer of closers) {
      try {
        await closer.close();
        logger.info({ dependency: closer.name }, 'closed');
      } catch (err) {
        logger.error({ err, dependency: closer.name }, 'close failed');
      }
    }
    process.exit(exitCode);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM', 0));
  process.on('SIGINT', () => void shutdown('SIGINT', 0));
  process.on('unhandledRejection', (err) => {
    logger.fatal({ err }, 'unhandled promise rejection');
    void shutdown('unhandledRejection', 1);
  });
}

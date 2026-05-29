import { TemporalModule } from 'nestjs-temporal-core';
import { socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';

// Optional allow-list of provider task queues that should auto-start a worker.
// When empty (default) every provider gets a worker, preserving the previous
// behavior. When set (comma-separated), only the listed providers spin up a
// worker, so unused providers no longer long-poll Temporal at idle.
// The "main" worker always starts regardless of this setting.
const getActiveProviderTaskQueues = () =>
  (process.env.POSTIZ_ACTIVE_PROVIDERS || '')
    .split(',')
    .map((p) => p.trim().split('-')[0])
    .filter(Boolean);

export const getTemporalModule = (
  isWorkers: boolean,
  path?: string,
  activityClasses?: any[]
) => {
  const activeProviders = getActiveProviderTaskQueues();
  return TemporalModule.register({
    isGlobal: true,
    connection: {
      address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
      ...process.env.TEMPORAL_TLS === 'true' ? {tls: true} : {},
      ...process.env.TEMPORAL_API_KEY ? {apiKey: process.env.TEMPORAL_API_KEY} : {},
      namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    },
    taskQueue: 'main',
    logLevel: 'error',
    ...(isWorkers
      ? {
          workers: [
            { identifier: 'main', maxConcurrentJob: undefined },
            ...socialIntegrationList,
          ]
            .filter((f) => f.identifier.indexOf('-') === -1)
            .filter(
              (f) =>
                f.identifier === 'main' ||
                activeProviders.length === 0 ||
                activeProviders.includes(f.identifier)
            )
            .map((integration) => ({
              taskQueue: integration.identifier.split('-')[0],
              workflowsPath: path!,
              activityClasses: activityClasses!,
              autoStart: true,
              ...(integration.maxConcurrentJob
                ? {
                    workerOptions: {
                      maxConcurrentActivityTaskExecutions:
                        integration.maxConcurrentJob,
                    },
                  }
                : {}),
            })),
        }
      : {}),
  });
};

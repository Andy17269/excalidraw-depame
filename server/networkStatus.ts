import { execFile } from 'node:child_process';

export const PING_HOST = 'baidu.com';
export const PING_TIMEOUT_MS = 5000;

export interface PingCommand {
  file: string;
  args: string[];
  timeoutMs: number;
}

export interface NetworkStatusResult {
  online: boolean;
  host: string;
  checkedAt: number;
  durationMs: number;
  reason?: string;
}

export type PingRunner = (command: PingCommand) => Promise<{ ok: boolean; reason?: string }>;

/**
 * Build cross-platform ping invocation arguments with a 5s timeout ceiling.
 */
export function buildPingCommand(
  platform: NodeJS.Platform = process.platform,
  host = PING_HOST,
  timeoutMs = PING_TIMEOUT_MS,
): PingCommand {
  const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
  if (platform === 'win32') {
    return { file: 'ping', args: ['-n', '1', '-w', String(timeoutMs), host], timeoutMs };
  }
  if (platform === 'darwin') {
    return { file: 'ping', args: ['-c', '1', '-t', String(timeoutSec), host], timeoutMs };
  }
  return { file: 'ping', args: ['-c', '1', '-W', String(timeoutSec), host], timeoutMs };
}

function defaultPingRunner(command: PingCommand): Promise<{ ok: boolean; reason?: string }> {
  return new Promise(resolve => {
    execFile(
      command.file,
      command.args,
      { timeout: command.timeoutMs, killSignal: 'SIGKILL', windowsHide: true },
      error => {
        if (!error) {
          resolve({ ok: true });
          return;
        }
        const info = error as { killed?: boolean; signal?: string };
        const timedOut = Boolean(info.killed) || info.signal === 'SIGKILL';
        resolve({
          ok: false,
          reason: timedOut ? `ping ${PING_HOST} 超时（${Math.round(command.timeoutMs / 1000)}s）` : error.message,
        });
      },
    );
  });
}

export interface CheckConnectivityOptions {
  platform?: NodeJS.Platform;
  host?: string;
  timeoutMs?: number;
  runner?: PingRunner;
  now?: () => number;
}

/**
 * Create a connectivity checker that probes public Internet reachability while deduplicating in-flight checks.
 */
export function createConnectivityChecker(defaultOptions: CheckConnectivityOptions = {}): () => Promise<NetworkStatusResult> {
  let inFlightProbe: Promise<NetworkStatusResult> | null = null;
  const now = defaultOptions.now ?? (() => Date.now());
  const host = defaultOptions.host ?? PING_HOST;
  const timeoutMs = defaultOptions.timeoutMs ?? PING_TIMEOUT_MS;
  const command = buildPingCommand(defaultOptions.platform ?? process.platform, host, timeoutMs);
  const runner = defaultOptions.runner ?? defaultPingRunner;

  return () => {
    if (inFlightProbe) return inFlightProbe;
    const startedAt = now();
    const probe = runner(command)
      .then((outcome): NetworkStatusResult => {
        const endedAt = now();
        return {
          online: outcome.ok,
          host,
          checkedAt: endedAt,
          durationMs: Math.max(0, endedAt - startedAt),
          ...(outcome.ok ? {} : { reason: outcome.reason ?? '网络不可达' }),
        };
      })
      .catch((error): NetworkStatusResult => {
        const endedAt = now();
        return {
          online: false,
          host,
          checkedAt: endedAt,
          durationMs: Math.max(0, endedAt - startedAt),
          reason: error instanceof Error ? error.message : '网络检测失败',
        };
      })
      .finally(() => {
        if (inFlightProbe === probe) {
          inFlightProbe = null;
        }
      });

    inFlightProbe = probe;
    return probe;
  };
}

export const checkInternetConnectivity = createConnectivityChecker();

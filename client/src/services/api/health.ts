import type { HealthResponse } from '../../types/protocol';
import { SERVER_URL } from '../../utils/config';

export async function fetchHealth(): Promise<HealthResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(`${SERVER_URL}/api/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Health check failed with HTTP ${response.status}.`);
    }
    return (await response.json()) as HealthResponse;
  } finally {
    window.clearTimeout(timeout);
  }
}

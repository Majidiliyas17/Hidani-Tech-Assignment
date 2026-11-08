import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHealth } from '../services/api/health';
import type { HealthResponse } from '../types/protocol';

export type HealthState =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'ok'; data: HealthResponse; error?: undefined }
  | { status: 'error'; data?: HealthResponse; error: string };

export function useHealthCheck() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setHealth({ status: 'loading' });
    try {
      const data = await fetchHealth();
      if (!mountedRef.current) return;
      setHealth({ status: 'ok', data });
    } catch {
      if (!mountedRef.current) return;
      setHealth({
        status: 'error',
        error: 'Backend is not reachable. Start it with “npm run dev” in the project root.',
      });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return { health, refresh };
}

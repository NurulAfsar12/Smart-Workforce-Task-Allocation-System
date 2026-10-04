import { useState, useEffect, useCallback } from 'react';

/**
 * Small data-fetching helper used by every page.
 * Keeps loading / error / refresh handling in one place instead of
 * duplicating useEffect blocks.
 */
export function useApi(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { data, loading, error, refresh: run, setData };
}

/** Wraps a mutating call with a pending flag and an error message. */
export function useMutation(action) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(
    async (...args) => {
      setPending(true);
      setError(null);
      try {
        return await action(...args);
      } catch (err) {
        setError(err.message || 'Action failed');
        throw err;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action]
  );

  return { run, pending, error, setError };
}
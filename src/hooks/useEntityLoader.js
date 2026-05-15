import { useCallback, useEffect, useState } from "react";

export function useEntityLoader(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loader();
      setData(next);
      return next;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loader, ...deps]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  return { data, loading, error, reload, setData };
}

import { useCallback, useEffect, useRef, useState } from "react";

export function useEntityLoader(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loaderRef.current();
      setData(next);
      return next;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  return { data, loading, error, reload, setData };
}

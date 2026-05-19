import { useCallback, useRef, useState } from "react";

export function useAsyncLock() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T,>(action: () => Promise<T> | T) => {
    if (locked.current) return undefined;
    locked.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}


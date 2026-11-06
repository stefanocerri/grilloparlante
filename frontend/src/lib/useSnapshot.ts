import { useEffect, useState } from "react";
import type { AppSnapshot } from "@shared/contracts";

export function useSnapshot(): AppSnapshot | null {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    void window.grillo.snapshot().then((value) => alive && setSnapshot(value));
    const off = window.grillo.onSnapshot(setSnapshot);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return snapshot;
}

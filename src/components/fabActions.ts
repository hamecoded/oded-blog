import { createContext, useContext, useEffect, type ReactNode } from 'react';

export interface FabAction {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

export const FabCtx = createContext<(a: FabAction[]) => void>(() => {});

/** Pages contribute context actions (edit, export, share…) to the floating menu. */
export function useFabActions(actions: FabAction[], deps: unknown[]) {
  const set = useContext(FabCtx);
  useEffect(() => {
    set(actions);
    return () => set([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

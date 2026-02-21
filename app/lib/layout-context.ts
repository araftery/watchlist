import { useOutletContext } from "react-router";

export interface LayoutContext {
  userServiceIds: number[];
}

export function useLayoutContext() {
  return useOutletContext<LayoutContext>();
}

import { createContext, useContext } from 'react';

export interface FocusRequest {
  ref: string;
  at: number;
}

const FocusRequestContext = createContext<FocusRequest | null>(null);

export const FocusRequestProvider = FocusRequestContext.Provider;

export function useFocusRequest(): FocusRequest | null {
  return useContext(FocusRequestContext);
}

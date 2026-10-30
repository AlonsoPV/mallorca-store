import type { QueryClient } from "@tanstack/react-query";
import { getGetCartQueryKey } from "@workspace/api-client-react";

export function writeCartCache(queryClient: QueryClient, cart: { id: string }) {
  queryClient.setQueryData(getGetCartQueryKey(cart.id), cart);
}

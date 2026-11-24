import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { isDemoMode } from "../lib/demoMode";
import { restoreQueryCache, startPersistingQueryCache } from "../lib/persistQueryCache";

/** Shows the last saved data right away when the app opens, then keeps saving fresh answers. */
export default function PersistQueryCache() {
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (loading || !userId || isDemoMode()) return undefined;
    restoreQueryCache(queryClient, userId);
    return startPersistingQueryCache(queryClient, userId);
  }, [queryClient, userId, loading]);

  return null;
}

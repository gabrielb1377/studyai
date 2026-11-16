"use client";

import { useCallback, useEffect, useState } from "react";
import { ConnectivityService, type ConnectivitySnapshot } from "./ConnectivityService";

const SERVER_SNAPSHOT: ConnectivitySnapshot = {
  status: "online",
  browserOnline: true,
  remoteReachable: true,
  isOnline: true,
  reconnected: false,
};

export function useConnectivity() {
  const [snapshot, setSnapshot] = useState<ConnectivitySnapshot>(SERVER_SNAPSHOT);

  useEffect(() => {
    setSnapshot(ConnectivityService.getSnapshot());
    return ConnectivityService.subscribe(setSnapshot);
  }, []);

  const dismissReconnected = useCallback(() => {
    ConnectivityService.dismissReconnected();
  }, []);

  return {
    ...snapshot,
    dismissReconnected,
  };
}

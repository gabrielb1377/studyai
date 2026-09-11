"use client";

import { useEffect, useState } from "react";
import { EMBEDDINGS_UPDATE_EVENT, EmbeddingStorage } from "./EmbeddingStorage";
import { ChunkStorage } from "./ChunkStorage";
import type { EmbeddingStore } from "./EmbeddingTypes";

function synchronizeStoredChunks() {
  try {
    EmbeddingStorage.synchronize(ChunkStorage.load().chunks);
  } catch {
    return;
  }
}

export function useEmbeddings() {
  const [store, setStore] = useState<EmbeddingStore>(() => EmbeddingStorage.load());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const refresh = () => setStore(EmbeddingStorage.load());
    synchronizeStoredChunks();
    refresh();
    setIsReady(true);
    window.addEventListener(EMBEDDINGS_UPDATE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EMBEDDINGS_UPDATE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return { store, isReady };
}

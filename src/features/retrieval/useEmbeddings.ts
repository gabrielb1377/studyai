"use client";

import { useEffect, useState } from "react";
import { EMBEDDINGS_UPDATE_EVENT, EmbeddingStorage } from "./EmbeddingStorage";
import { ChunkStorage } from "./ChunkStorage";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  type EmbeddingStore,
} from "./EmbeddingTypes";

const initialStore: EmbeddingStore = {
  version: 2,
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS,
  encoding: "int8-base64",
  status: "idle",
  embeddings: [],
};

async function synchronizeStoredChunks() {
  try {
    await EmbeddingStorage.synchronize((await ChunkStorage.load()).chunks);
  } catch {
    return;
  }
}

export function useEmbeddings() {
  const [store, setStore] = useState<EmbeddingStore>(initialStore);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const refresh = async () => {
      setStore(await EmbeddingStorage.load());
      setIsReady(true);
    };
    void synchronizeStoredChunks().then(refresh);
    const handleRefresh = () => { void refresh(); };
    window.addEventListener(EMBEDDINGS_UPDATE_EVENT, handleRefresh);
    window.addEventListener("studyai:storage-updated", handleRefresh);
    return () => {
      window.removeEventListener(EMBEDDINGS_UPDATE_EVENT, handleRefresh);
      window.removeEventListener("studyai:storage-updated", handleRefresh);
    };
  }, []);

  return { store, isReady };
}

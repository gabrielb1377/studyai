type RuntimeMaterial = {
  file: File;
  source: string;
};

const runtimeMaterials = new Map<string, RuntimeMaterial>();

export const MaterialRuntimeStore = {
  register(materialId: string, file: File) {
    this.remove(materialId);
    runtimeMaterials.set(materialId, {
      file,
      source: URL.createObjectURL(file),
    });
  },

  get(materialId: string) {
    return runtimeMaterials.get(materialId) ?? null;
  },

  remove(materialId: string) {
    const existing = runtimeMaterials.get(materialId);
    if (!existing) return;
    URL.revokeObjectURL(existing.source);
    runtimeMaterials.delete(materialId);
  },
};

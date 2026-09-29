/** Résultat d'une synchro, partagé entre le serveur (sync.ts) et l'interface. */
export type SyncResult = {
  status: "fresh" | "synced" | "no-source" | "error";
  syncedAt: string | null;
  error: string | null;
};

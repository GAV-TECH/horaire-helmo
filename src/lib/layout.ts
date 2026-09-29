export type Placed<T> = { item: T; lane: number; lanes: number };

/**
 * Répartit des séances qui se chevauchent en colonnes ("lanes") pour les afficher côte à côte.
 * Les séances liées par des chevauchements successifs forment un groupe ; toutes les séances
 * d'un groupe partagent le même nombre de colonnes, pour que les largeurs restent alignées.
 */
export function layoutOverlaps<T extends { start: string; end: string }>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  const result: Placed<T>[] = [];

  let group: Placed<T>[] = [];
  let laneEnds: string[] = []; // heure de fin de la dernière séance de chaque colonne
  let groupEnd = "";

  const closeGroup = () => {
    for (const placed of group) placed.lanes = laneEnds.length;
    result.push(...group);
    group = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (group.length > 0 && item.start >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(item.end) - 1;
    else laneEnds[lane] = item.end;
    group.push({ item, lane, lanes: 0 });
    groupEnd = group.length === 1 ? item.end : groupEnd > item.end ? groupEnd : item.end;
  }
  closeGroup();
  return result;
}

import type { ActivityDept } from '@/features/admin/panel';

export type ActivityMapProps = {
  depts: ActivityDept[];
  height: number;
  selected: string | null;
  onSelect: (dept: string) => void;
};

/** Diamètre d'une bulle selon le nombre de pilotes (surface proportionnelle). */
export const bubbleSize = (pilots: number, max: number) => 22 + Math.sqrt(pilots / Math.max(1, max)) * 38;

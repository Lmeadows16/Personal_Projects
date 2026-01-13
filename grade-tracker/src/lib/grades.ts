export type Category = {
  id: string;
  name: string;
  weight: number; // 0..100
  drop_lowest: number;
};

export type Assignment = {
  id: string;
  category_id: string;
  title: string;
  points_earned: number | null;
  points_possible: number | null;
  status: "planned" | "submitted" | "graded" | "missing";
};

function pct(a: Assignment): number | null {
  if (a.points_earned == null || a.points_possible == null) return null;
  if (a.points_possible <= 0) return null;
  return Number(a.points_earned) / Number(a.points_possible);
}

/**
 * Weighted category model:
 * - Each category contributes: (category_average) * (weight/100)
 * - Category average is computed from assignments with numeric scores.
 * - If drop_lowest > 0, we drop the lowest N percentages among graded assignments in that category.
 * - Categories with no graded items contribute 0 (you can change this behavior later).
 */
export function computeWeightedGrade(
  categories: Category[],
  assignments: Assignment[],
): { overallPct: number; byCategory: Record<string, number | null> } {
  const byCategory: Record<string, number | null> = {};
  let overall = 0;

  for (const c of categories) {
    const items = assignments
      .filter((a) => a.category_id === c.id)
      .map((a) => ({ a, p: pct(a) }))
      .filter((x) => x.p != null) as { a: Assignment; p: number }[];

    // Only consider actually graded/submitted w scores (your choice). Here: any numeric score counts.
    const pcts = items.map((x) => x.p);

    if (pcts.length === 0) {
      byCategory[c.id] = null;
      continue;
    }

    // Drop lowest N
    const sorted = [...pcts].sort((x, y) => x - y);
    const drop = Math.min(
      c.drop_lowest,
      sorted.length - 1,
      Math.max(0, c.drop_lowest),
    );
    const kept = sorted.slice(drop);

    const avg = kept.reduce((s, v) => s + v, 0) / kept.length;
    byCategory[c.id] = avg;

    overall += avg * (c.weight / 100);
  }

  return { overallPct: overall, byCategory };
}

export function formatPct(x: number | null, digits = 1): string {
  if (x == null) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

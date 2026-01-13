export type Category = {
  id: string;
  name: string;
  weight: number; // percent
  drop_lowest: number;
};

export type Assignment = {
  id: string;
  category_id: string;
  title: string;
  points_earned: number | null;
  points_possible: number | null;
  status: "planned" | "submitted" | "graded" | "missing" | string | null;
};

function pct(a: Assignment): number | null {
  if (a.points_earned == null || a.points_possible == null) return null;
  if (a.points_possible <= 0) return null;
  return a.points_earned / a.points_possible;
}

/**
 * Your original API:
 * - overallPct: weighted course grade (0..1)
 * - byCategory: weighted category averages (0..1)
 */
export function computeWeightedGrade(
  categories: Category[],
  assignments: Assignment[],
) {
  const byCategory: Record<string, number | null> = {};
  let overallPct = 0;

  for (const c of categories) {
    const graded = assignments
      .filter((a) => a.category_id === c.id)
      .map((a) => pct(a))
      .filter((p): p is number => p != null);

    if (graded.length === 0) {
      byCategory[c.id] = null;
      continue;
    }

    // drop lowest
    const sorted = [...graded].sort((a, b) => a - b);
    const drop = Math.max(0, Math.min(c.drop_lowest, sorted.length - 1));
    const kept = sorted.slice(drop);

    const avg = kept.reduce((s, v) => s + v, 0) / kept.length;
    byCategory[c.id] = avg;

    overallPct += avg * (c.weight / 100);
  }

  return { overallPct, byCategory };
}

export function computeCourseStats(
  categories: Category[],
  assignments: Assignment[],
) {
  let totalEarned = 0;
  let totalPossible = 0;

  const categoryUnweighted: Record<string, number | null> = {};
  const categoryPoints: Record<string, { earned: number; possible: number }> =
    {};

  for (const c of categories) {
    const pts = assignments.filter(
      (a) =>
        a.category_id === c.id &&
        a.points_earned != null &&
        a.points_possible != null &&
        a.points_possible! > 0,
    );

    const earned = pts.reduce((s, a) => s + Number(a.points_earned), 0);
    const possible = pts.reduce((s, a) => s + Number(a.points_possible), 0);

    categoryPoints[c.id] = { earned, possible };
    categoryUnweighted[c.id] = possible > 0 ? earned / possible : null;

    totalEarned += earned;
    totalPossible += possible;
  }

  const overallUnweighted = totalPossible > 0 ? totalEarned / totalPossible : 0;
  const weighted = computeWeightedGrade(categories, assignments);

  return {
    overallWeighted: weighted.overallPct,
    overallUnweighted,
    categoryUnweighted,
    categoryWeighted: weighted.byCategory,
    totals: { earned: totalEarned, possible: totalPossible },
  };
}

export function formatPct(x: number | null, digits = 1) {
  if (x == null) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

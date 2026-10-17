export interface DailyVisits {
  date: string;
  visitors: number;
  pageviews: number;
}

export interface RankedEntry {
  label: string;
  count: number;
}

export interface AnalyticsStats {
  days: number;
  /** Somme des visiteurs uniques de chaque jour (l'identifiant change chaque jour). */
  visitors: number;
  pageviews: number;
  daily: DailyVisits[];
  topPages: RankedEntry[];
  topReferrers: RankedEntry[];
}

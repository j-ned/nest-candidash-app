import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { lt, sql } from 'drizzle-orm';
import { DrizzleService } from '../db/drizzle.service';
import { visits } from '../db/schema';
import { ANALYTICS_MAX_DAYS } from './dto/analytics-query.dto';
import type { TrackVisitDto } from './dto/track-visit.dto';
import type {
  AnalyticsStats,
  DailyVisits,
  RankedEntry,
} from './analytics-stats.interface';
import {
  isBot,
  toReferrerHost,
  toTrackedPath,
  toVisitorHash,
} from './visit-rules';
import { toVisitSource } from './visit-source';

const TIME_ZONE = 'Europe/Paris';
const TOP_LIMIT = 10;

export interface VisitContext {
  ip: string;
  userAgent: string;
  origin: string | undefined;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly secret: string;

  constructor(
    private readonly drizzle: DrizzleService,
    config: ConfigService,
  ) {
    // Clé dérivée : pas de secret de plus à configurer, et distincte de celle qui signe les JWT
    this.secret = createHash('sha256')
      .update(`analytics|${config.getOrThrow<string>('JWT_SECRET')}`)
      .digest('hex');
  }

  /** Ne lève jamais : une mesure perdue ne doit pas casser la navigation. */
  async track(dto: TrackVisitDto, context: VisitContext): Promise<void> {
    if (isBot(context.userAgent)) return;
    const path = toTrackedPath(dto.path);
    if (!path) return;

    const referrerHost = toReferrerHost(
      dto.referrer,
      this.hostOf(context.origin),
    );
    try {
      await this.drizzle.db.insert(visits).values({
        visitorHash: toVisitorHash(
          this.secret,
          context.ip,
          context.userAgent,
          this.today(),
        ),
        path,
        referrerHost,
        source: toVisitSource(dto.path, referrerHost),
      });
    } catch (error) {
      this.logger.warn(`Visite non enregistrée : ${String(error)}`);
    }
  }

  async stats(days: number): Promise<AnalyticsStats> {
    const day = sql`(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TIME_ZONE})::date`;
    const since = sql`(now() AT TIME ZONE ${TIME_ZONE})::date - ${days - 1}::int`;

    const daily = await this.drizzle.db.execute<{
      date: string;
      visitors: string;
      pageviews: string;
    }>(sql`
      SELECT to_char(d, 'YYYY-MM-DD') AS date,
             COUNT(DISTINCT v."visitorHash") AS visitors,
             COUNT(v.id) AS pageviews
      FROM generate_series(${since}, (now() AT TIME ZONE ${TIME_ZONE})::date, interval '1 day') AS d
      LEFT JOIN "Visites" v ON ${day} = d::date
      GROUP BY d ORDER BY d`);

    const topPages = await this.drizzle.db.execute<{
      label: string;
      count: string;
    }>(sql`
      SELECT path AS label, COUNT(*) AS count FROM "Visites"
      WHERE ${day} >= ${since}
      GROUP BY path ORDER BY count DESC, path LIMIT ${TOP_LIMIT}`);

    // Une ligne par visiteur et par jour : sa première origine connue, sinon accès direct (null)
    const topSources = await this.drizzle.db.execute<{
      label: string | null;
      count: string;
    }>(sql`
      WITH per_visit AS (
        SELECT (array_agg(source ORDER BY "createdAt") FILTER (WHERE source IS NOT NULL))[1] AS source
        FROM "Visites"
        WHERE ${day} >= ${since}
        GROUP BY "visitorHash", ${day}
      )
      SELECT source AS label, COUNT(*) AS count FROM per_visit
      GROUP BY source ORDER BY count DESC, label NULLS LAST LIMIT ${TOP_LIMIT}`);

    const series: DailyVisits[] = daily.rows.map((row) => ({
      date: row.date,
      visitors: Number(row.visitors),
      pageviews: Number(row.pageviews),
    }));
    const ranked = (rows: { label: string; count: string }[]): RankedEntry[] =>
      rows.map((row) => ({ label: row.label, count: Number(row.count) }));

    return {
      days,
      visitors: series.reduce((sum, d) => sum + d.visitors, 0),
      pageviews: series.reduce((sum, d) => sum + d.pageviews, 0),
      daily: series,
      topPages: ranked(topPages.rows),
      topSources: topSources.rows.map((row) => ({
        label: row.label,
        count: Number(row.count),
      })),
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: TIME_ZONE })
  async purgeOldVisits(): Promise<void> {
    const cutoff = new Date(
      Date.now() - ANALYTICS_MAX_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.drizzle.db.delete(visits).where(lt(visits.createdAt, cutoff));
  }

  private today(): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE }).format(
      new Date(),
    );
  }

  private hostOf(origin: string | undefined): string {
    try {
      return origin ? new URL(origin).hostname : '';
    } catch {
      return '';
    }
  }
}

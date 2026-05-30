import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

// ---------- Enums (noms = types PG réels, confirmés par drizzle-kit pull) ----------
export const roleEnum = pgEnum('Role', ['ADMIN', 'USER']);
export const jobStatusEnum = pgEnum('JobStatus', [
  'APPLIED',
  'INTERVIEW',
  'REJECTED',
  'ACCEPTED',
]);
export const contractTypeEnum = pgEnum('ContractType', [
  'CDI',
  'CDD',
  'INTERIM',
  'STAGE',
  'ALTERNANCE',
  'FREELANCE',
]);

const ts = (name: string) =>
  timestamp(name, { precision: 3, mode: 'date', withTimezone: false });

// id TEXT sans default SQL → généré côté app (parité Prisma @default(uuid())).
const idCol = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID());

// updatedAt NOT NULL sans default SQL → géré côté app (parité Prisma @updatedAt).
const updatedAtCol = () =>
  ts('updatedAt')
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());

// ---------- Utilisateurs (User) ----------
export const users = pgTable(
  'Utilisateurs',
  {
    id: idCol(),
    email: text('email').notNull(),
    username: text('username'),
    password: text('password').notNull(),
    role: roleEnum('role').notNull().default('USER'),
    refreshToken: text('refreshToken'),
    refreshTokenExpires: ts('refreshTokenExpires'),
    resetPasswordToken: text('resetPasswordToken'),
    resetPasswordExpires: ts('resetPasswordExpires'),
    totpSecret: text('totpSecret'),
    totpEnabled: boolean('totpEnabled').notNull().default(false),
    totpRecoveryCodes: text('totpRecoveryCodes')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: ts('createdAt').notNull().defaultNow(),
    updatedAt: updatedAtCol(),
  },
  (t) => [uniqueIndex('Utilisateurs_email_key').on(t.email)],
);

// ---------- Annonces (JobTrack) ----------
export const jobTracks = pgTable(
  'Annonces',
  {
    id: idCol(),
    userId: text('userId').notNull(),
    title: text('title').notNull(),
    company: text('company'),
    jobUrl: text('jobUrl'),
    appliedAt: ts('appliedAt'),
    status: jobStatusEnum('status').notNull().default('APPLIED'),
    contractType: contractTypeEnum('contractType'),
    notes: text('notes'),
    cvFileName: text('cvFileName'),
    lmFileName: text('lmFileName'),
    createdAt: ts('createdAt').notNull().defaultNow(),
    updatedAt: updatedAtCol(),
  },
  (t) => [
    index('Annonces_userId_idx').on(t.userId),
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: 'Annonces_userId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
  ],
);

// ---------- Relance (Reminder) ----------
export const reminders = pgTable(
  'Relance',
  {
    id: idCol(),
    jobTrackId: text('jobTrackId').notNull(),
    frequency: integer('frequency').notNull(),
    nextReminderAt: ts('nextReminderAt').notNull(),
    lastSentAt: ts('lastSentAt'),
    isActive: boolean('isActive').notNull().default(true),
    createdAt: ts('createdAt').notNull().defaultNow(),
    updatedAt: updatedAtCol(),
  },
  (t) => [
    index('Relance_jobTrackId_idx').on(t.jobTrackId),
    index('Relance_isActive_nextReminderAt_idx').on(
      t.isActive,
      t.nextReminderAt,
    ),
    foreignKey({
      columns: [t.jobTrackId],
      foreignColumns: [jobTracks.id],
      name: 'Relance_jobTrackId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
  ],
);

// ---------- UserTracking (non utilisé en code, présent pour parité schéma) ----------
export const userTracking = pgTable(
  'UserTracking',
  {
    id: idCol(),
    userId: text('userId').notNull(),
    totalApplications: integer('totalApplications').notNull().default(0),
    totalRemindersSent: integer('totalRemindersSent').notNull().default(0),
    applicationsPerStatus: jsonb('applicationsPerStatus').notNull().default({}),
    lastActionAt: ts('lastActionAt'),
    responseRate: doublePrecision('responseRate').default(0),
    remindersEffectiveness: doublePrecision('remindersEffectiveness').default(0),
    avgResponseTime: doublePrecision('avgResponseTime').default(0),
    createdAt: ts('createdAt').notNull().defaultNow(),
    updatedAt: updatedAtCol(),
  },
  (t) => [
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: 'UserTracking_userId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
  ],
);

// ---------- CodesVerification (VerificationCode) ----------
export const verificationCodes = pgTable(
  'CodesVerification',
  {
    id: idCol(),
    email: text('email').notNull(),
    code: text('code').notNull(),
    expiresAt: ts('expiresAt').notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: ts('createdAt').notNull().defaultNow(),
    updatedAt: updatedAtCol(),
  },
  (t) => [uniqueIndex('CodesVerification_email_key').on(t.email)],
);

// ---------- UtilisateursEnAttente (PendingUser) ----------
export const pendingUsers = pgTable(
  'UtilisateursEnAttente',
  {
    id: idCol(),
    email: text('email').notNull(),
    username: text('username'),
    password: text('password').notNull(),
    verified: boolean('verified').notNull().default(false),
    createdAt: ts('createdAt').notNull().defaultNow(),
    updatedAt: updatedAtCol(),
  },
  (t) => [uniqueIndex('UtilisateursEnAttente_email_key').on(t.email)],
);

// ---------- Relations (pour db.query.*.findMany({ with })) ----------
export const usersRelations = relations(users, ({ many }) => ({
  jobTracks: many(jobTracks),
  userTracking: many(userTracking),
}));

export const jobTracksRelations = relations(jobTracks, ({ one, many }) => ({
  user: one(users, { fields: [jobTracks.userId], references: [users.id] }),
  reminders: many(reminders),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  jobtrack: one(jobTracks, {
    fields: [reminders.jobTrackId],
    references: [jobTracks.id],
  }),
}));

export const userTrackingRelations = relations(userTracking, ({ one }) => ({
  user: one(users, { fields: [userTracking.userId], references: [users.id] }),
}));

// ---------- Types inférés (remplacent les types Prisma) ----------
export type UserRow = typeof users.$inferSelect;
export type JobTrackRow = typeof jobTracks.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;
export type PendingUserRow = typeof pendingUsers.$inferSelect;
export type VerificationCodeRow = typeof verificationCodes.$inferSelect;

// Enums exposés à la fois comme type ET valeur runtime (parité avec les enums
// Prisma générés : `JobStatus.APPLIED`, `enum: ContractType`, etc.).
export type Role = (typeof roleEnum.enumValues)[number];
export const Role = { ADMIN: 'ADMIN', USER: 'USER' } as const satisfies Record<
  string,
  Role
>;

export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export const JobStatus = {
  APPLIED: 'APPLIED',
  INTERVIEW: 'INTERVIEW',
  REJECTED: 'REJECTED',
  ACCEPTED: 'ACCEPTED',
} as const satisfies Record<string, JobStatus>;

export type ContractType = (typeof contractTypeEnum.enumValues)[number];
export const ContractType = {
  CDI: 'CDI',
  CDD: 'CDD',
  INTERIM: 'INTERIM',
  STAGE: 'STAGE',
  ALTERNANCE: 'ALTERNANCE',
  FREELANCE: 'FREELANCE',
} as const satisfies Record<string, ContractType>;

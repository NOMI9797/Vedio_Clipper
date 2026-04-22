import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const projectStatusEnum = pgEnum("project_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const jobTypeEnum = pgEnum("job_type", ["ingest", "transcribe"]);

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "processing",
  "transcript_complete",
  "failed",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: projectStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("projects_user_id_created_at_idx").on(t.userId, t.createdAt),
  ]
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobType: jobTypeEnum("job_type").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    error: text("error"),
    objectKey: text("object_key"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("jobs_project_id_idx").on(t.projectId),
    index("jobs_user_id_idx").on(t.userId),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  jobs: many(jobs),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  project: one(projects, { fields: [jobs.projectId], references: [projects.id] }),
  user: one(users, { fields: [jobs.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

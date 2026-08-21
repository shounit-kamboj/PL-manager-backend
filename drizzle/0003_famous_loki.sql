CREATE TYPE "public"."Feds" AS ENUM('IPF', 'NAPF', 'COMMONWEALTHPF', 'CANPL', 'BCPA', 'APU', 'MPA', 'NBPL', 'NLPA', 'NSPL', 'OPA', 'PEIPLA', 'FQD', 'SPA');--> statement-breakpoint
ALTER TABLE "coach_tasks" RENAME COLUMN "coach_id" TO "coachId";--> statement-breakpoint
ALTER TABLE "coach_tasks" RENAME COLUMN "athlete_id" TO "athleteId";--> statement-breakpoint
ALTER TABLE "coach_tasks" DROP CONSTRAINT "coach_tasks_coach_id_coaches_id_fk";
--> statement-breakpoint
ALTER TABLE "coach_tasks" DROP CONSTRAINT "coach_tasks_athlete_id_athletes_id_fk";
--> statement-breakpoint
ALTER TABLE "athletes" ADD COLUMN "notes" varchar(1000) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "athletes_and_competitions" ADD COLUMN "is_current" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "federation" "Feds";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "is_current" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "training_blocks" ADD COLUMN "is_current" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "coach_tasks" ADD CONSTRAINT "coach_tasks_coachId_coaches_id_fk" FOREIGN KEY ("coachId") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_tasks" ADD CONSTRAINT "coach_tasks_athleteId_athletes_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;
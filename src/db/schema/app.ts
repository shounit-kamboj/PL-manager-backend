import {timestamp, integer, varchar, pgTable, date, decimal, boolean,time,pgEnum} from "drizzle-orm/pg-core";
import { relations } from 'drizzle-orm';

//Enums
export const genderEnum = pgEnum('gender_type',
    ['male', 'female', 'non-binary', 'prefer-not-to-say']);

export const equipmentEnum = pgEnum('equipment_type',
    ['Classic/Raw', 'Equipped','both']);

export const paymentStatusEnum = pgEnum('payment_statuses',
    ['paid','unpaid','overdue']);

export const taskStatusEnum = pgEnum('task_status',
    ['pending', 'completed', 'overdue']);


//tables
const timestamps = {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull()
}

export const coaches = pgTable('coaches',{
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    name: varchar('name', {length: 255}).notNull(),
    email: varchar('email', {length: 255}).notNull().unique(),
    passwordHash: varchar('password_hash', {length: 255}).notNull(),
    ...timestamps

});

export const athletes = pgTable('athletes', {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    coachId: integer('coachId').notNull().references(
        () => coaches.id, { onDelete: 'restrict'}),
    name: varchar('name', {length: 255}).notNull(),
    email: varchar('email', {length: 255}),
    gender: genderEnum('gender').notNull(),
    dateOfBirth: date('date_of_birth', { mode: 'date' }).notNull(),
    phoneNumber: varchar('phoneNumber', {length: 11}),
    country: varchar('country', { length: 100 }),
    city: varchar('city', { length: 100 }),
    province: varchar('province', { length: 100 }),
    timezone: varchar('timezone', { length: 100 }),
    equipment: equipmentEnum('equipment'),

    prSquat: decimal('pr_squat', { precision: 4, scale: 1 }),
    prBench: decimal('pr_bench', { precision: 4, scale: 1 }),
    prDeadlift: decimal('pr_deadlift', { precision: 4, scale: 1 }),
    prTotal: decimal('pr_total', { precision: 5, scale: 1 }),

    meetPrSquat: decimal('meet_pr_squat', { precision: 4, scale: 1 }),
    meetPrBench: decimal('meet_pr_bench', { precision: 4, scale: 1 }),
    meetPrDeadlift: decimal('meet_pr_deadlift', { precision: 4, scale: 1 }),
    meetPrTotal: decimal('meet_pr_total', { precision: 5, scale: 1 }),

    link: varchar('link', { length: 200 }),
    joinedAt:  date('joined_at', { mode: 'date' }).notNull(),
    ...timestamps,

    isActive: boolean('is_active').default(true),
    deleted: boolean('deleted').default(false),
    deletedAt: timestamp('deleted_at')
});

export const payments = pgTable('payments',{
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    athleteId: integer('athleteId').notNull().references(
        () => athletes.id, { onDelete: 'restrict'}),
    coachId: integer('coachId').notNull().references(
        () => coaches.id, { onDelete: 'restrict'}),
    amountCAD: decimal('amount_in_cad', { precision: 5, scale: 2 }),
    dueDate: date('due_date' , { mode: 'date' }).notNull(),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('unpaid'),
    ...timestamps
});

export const competitions =pgTable('competitions',{
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    name: varchar('name',{length: 255}),
    startDate: date('start_date' , { mode: 'date' }).notNull(),
    endDate: date('end_date' , { mode: 'date' }).notNull(),
    country: varchar('country', { length: 100 }),
    city: varchar('city', { length: 100 }),
    province: varchar('province', { length: 100 }),
    link: varchar('link', { length: 200 }),
    ...timestamps

});

export const athletesAndCompetitions = pgTable('athletes_and_competitions', {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    athleteId: integer('athleteId').notNull().references(
        () => athletes.id, { onDelete: 'restrict'}),
    coachId: integer('coachId').notNull().references(
        () => coaches.id, { onDelete: 'restrict'}),
    compId: integer('compId').notNull().references(
        () => competitions.id, { onDelete: 'restrict'}),
    date: date('date' , { mode: 'date' }),
    weighInTime: time('weigh_in_time'),
    equipment: equipmentEnum('equipment'),
    ...timestamps

})

export const trainingBlocks = pgTable('training_blocks',{
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    athleteId: integer('athleteId').notNull().references(
        () => athletes.id, { onDelete: 'restrict'}),
    coachId: integer('coachId').notNull().references(
        () => coaches.id, { onDelete: 'restrict'}),
    startDate: date('start_date' , { mode: 'date' }).notNull(),
    endDate: date('end_date' , { mode: 'date' }).notNull(),
    lastUpdate: date('last_update' , { mode: 'date' }).notNull(),
    daysBetweenUpdates: integer('days_till_updates').notNull(),
    sendPostBlockOverviewReminder: boolean('send_post_block_overview_reminder').default(false),
    link: varchar('link', { length: 200 }),
    ...timestamps


});

export const coachTasks = pgTable('coach_tasks', {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    coachId: integer('coach_id').notNull().references(
        () => coaches.id, { onDelete: 'cascade' }),
    athleteId: integer('athlete_id').references(
        () => athletes.id, { onDelete: 'cascade' }),
    trainingBlockId:integer('training_block_id').references(
        () => trainingBlocks.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    dueDate: date('due_date', { mode: 'date' }),
    completed: boolean('completed').notNull().default(false),
    status: taskStatusEnum('status').notNull().default('pending'),
    ...timestamps,
});

//relationships
export const coachesRelations = relations(coaches, ({ many }) => ({
    athletes: many(athletes),
    payments: many(payments),
    trainingBlocks: many(trainingBlocks),
    coachTasks: many(coachTasks),
}));

export const athletesRelations = relations(athletes, ({ one, many }) => ({
    coach: one(coaches, {
        fields: [athletes.coachId],
        references: [coaches.id],
    }),
    payments: many(payments),
    trainingBlocks: many(trainingBlocks),
    coachTasks: many(coachTasks),
    competitions: many(athletesAndCompetitions),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
    athlete: one(athletes, {
        fields: [payments.athleteId],
        references: [athletes.id],
    }),
    coach: one(coaches, {
        fields: [payments.coachId],
        references: [coaches.id],
    }),
}));

export const trainingBlockRelations = relations(trainingBlocks, ({ one, many }) => ({
    athlete: one(athletes, {
        fields: [trainingBlocks.athleteId],
        references: [athletes.id],
    }),
    coach: one(coaches, {
        fields: [trainingBlocks.coachId],
        references: [coaches.id],
    }),
    coachTasks: many(coachTasks),
}));

export const coachTasksRelations = relations(coachTasks, ({ one }) => ({
    coach: one(coaches, {
        fields: [coachTasks.coachId],
        references: [coaches.id],
    }),
    athlete: one(athletes, {
        fields: [coachTasks.athleteId],
        references: [athletes.id],
    }),
    trainingBlock: one(trainingBlocks, {
        fields: [coachTasks.trainingBlockId],
        references: [trainingBlocks.id],
    }),
}));

export const competitionsRelations = relations(competitions, ({ many }) => ({
    athletes: many(athletesAndCompetitions),
}));

export const athletesAndCompetitionsRelations = relations(athletesAndCompetitions, ({ one }) => ({
    athlete: one(athletes, {
        fields: [athletesAndCompetitions.athleteId],
        references: [athletes.id],
    }),
    coach: one(coaches, {
        fields: [athletesAndCompetitions.coachId],
        references: [coaches.id],
    }),
    competition: one(competitions, {
        fields: [athletesAndCompetitions.compId],
        references: [competitions.id],
    }),
}));

//exporting types
export type Coach = typeof coaches.$inferSelect;
export type SafeCoach = Omit<Coach, 'passwordHash'>;

export type Athlete = typeof athletes.$inferSelect;
export type NewAthlete = typeof athletes.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export type Competition = typeof competitions.$inferSelect;
export type NewCompetition = typeof competitions.$inferInsert;

export type AthletesAndCompetition = typeof athletesAndCompetitions.$inferSelect;
export type NewAthletesAndCompetition = typeof athletesAndCompetitions.$inferInsert;

export type TrainingBlock = typeof trainingBlocks.$inferSelect;
export type NewTrainingBlock = typeof trainingBlocks.$inferInsert;

export type CoachTask = typeof coachTasks.$inferSelect;
export type NewCoachTask = typeof coachTasks.$inferInsert;
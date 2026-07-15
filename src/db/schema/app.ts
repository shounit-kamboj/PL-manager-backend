import {timestamp, integer, varchar, pgTable, date, decimal, boolean} from "drizzle-orm/pg-core";
import { pgEnum } from 'drizzle-orm/pg-core';

export const genderEnum = pgEnum('gender_type',
    ['male', 'female', 'non-binary', 'prefer-not-to-say']);

export const equipmentEnum = pgEnum('equipment_type',
    ['Classic/Raw', 'Equipped','both']);


const timestamps = {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull()
}

export const coaches = pgTable('coachs',{
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

})


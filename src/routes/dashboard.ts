import express from "express";
import { and, asc, between, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {athletes, athletesAndCompetitions, competitions, payments, trainingBlocks} from "../db/schema/index.js";
import { isValidDay, clampDays, daySql } from "../lib/today.js";

const router = express.Router();

const RETENTION_DIVISORS = { days: 1, weeks: 7, months: 30.44, years: 365.25 } as const;
type RetentionUnit = keyof typeof RETENTION_DIVISORS;

const DEFAULT_RETENTION_UNIT: RetentionUnit = "years";
const DEFAULT_MEET_DAYS = 30; // "meets in the next X days", meetdays = x
const DEFAULT_BLOCK_DAYS = 4; // "blocks due in the next Y days", blockdays = y




router.get("/", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });

        const today = req.query.today;
        if (!isValidDay(today)) return res.status(400).json({ message: "today must be yyyy-mm-dd" });

        const meetDays = clampDays(req.query.meetDays, DEFAULT_MEET_DAYS);
        const blockDays = clampDays(req.query.blockDays, DEFAULT_BLOCK_DAYS);

        const unitParam = req.query.retentionUnit;
        const retentionUnit: RetentionUnit =
            typeof unitParam === "string" && Object.hasOwn(RETENTION_DIVISORS, unitParam)
                ? (unitParam as RetentionUnit)
                : DEFAULT_RETENTION_UNIT;
        const retentionDivisor = RETENTION_DIVISORS[retentionUnit];
        const monthStart = sql`date_trunc('month', ${daySql(today)}::timestamp)::date`;


        const isActive = sql`(${athletes.isActive} AND NOT ${athletes.deleted})`;

        const athleteQuery = db
            .select({
                activeAthletes: sql<number>`COUNT(*) FILTER (WHERE ${isActive})`.mapWith(Number),
                mrr: sql<number>`ROUND(COALESCE(SUM(${athletes.paymentPrice} / ${athletes.paymentCycleLengthWeeks} * 52 / 12) FILTER (WHERE ${isActive} AND ${athletes.paymentCycleLengthWeeks} > 0), 0), 2)`.mapWith(Number),
                athleteRetentionTime:sql<number>`ROUND(
            COALESCE(
                AVG(
                    CASE
                        WHEN ${athletes.deleted}
                        THEN ${athletes.deletedAt}::date - ${athletes.joinedAt}
                        ELSE ${daySql(today)} - ${athletes.joinedAt}
                    END
                )::numeric /${retentionDivisor}::numeric,
            0), 2)`.mapWith(Number),
            })
            .from(athletes)
            .where(eq(athletes.coachId, coachId));


        const inWindow = between(athletesAndCompetitions.date, daySql(today), sql`${daySql(today)} + ${meetDays}::int`);


        const athleteCompetitionsQuery = db
            .select({
                numMyAthletesCompetitions: sql<number>`COUNT(*) FILTER (WHERE ${inWindow})`.mapWith(Number),
            })
            .from(athletesAndCompetitions)
            .where(and(
                eq(athletesAndCompetitions.coachId, coachId),
                eq(athletesAndCompetitions.isCurrent, true),
                eq(athletesAndCompetitions.deleted, false),
            ));

        const nextMeetQuery = db
            .select({
                nextAthleteMeetDate: athletesAndCompetitions.date,
                nextAthleteMeetName: competitions.name,
            })
            .from(athletesAndCompetitions)
            .innerJoin(competitions, eq(athletesAndCompetitions.compId, competitions.id))
            .where(and(
                eq(athletesAndCompetitions.coachId, coachId),
                eq(athletesAndCompetitions.isCurrent, true),
                eq(athletesAndCompetitions.deleted, false),
                gte(athletesAndCompetitions.date, daySql(today)),
            ))
            .orderBy(asc(athletesAndCompetitions.date), asc(competitions.name))
            .limit(1);

        const paymentQuery = db
            .select({
                numOverduePayments: sql<number>`COUNT(*) FILTER (WHERE ${payments.paymentStatus} = 'overdue' AND ${payments.isCurrent})`.mapWith(Number),
                moneyMadeMonth: sql<number>`ROUND(COALESCE(SUM(${athletes.paymentPrice}) FILTER (WHERE ${payments.paymentStatus} IN ('paid', 'paid_late') AND date_trunc('month', ${payments.paidAt}) = ${monthStart}), 0), 2)`.mapWith(Number),
            })
            .from(payments)
            .innerJoin(athletes, eq(payments.athleteId, athletes.id))
            .where(and(
                eq(payments.coachId, coachId),
                eq(payments.deleted, false),
            ));

        const blockQuery = db
            .select({
                numBlockToUpdate: sql<number>`COUNT(*)`.mapWith(Number),
            })
            .from(trainingBlocks)
            .where(and(
                eq(trainingBlocks.coachId, coachId),
                eq(trainingBlocks.isCurrent, true),
                eq(trainingBlocks.deleted, false),
                // next update date falls on or before the end of the window
                sql`${trainingBlocks.lastUpdate} + ${trainingBlocks.daysBetweenUpdates} <= ${daySql(today)} + ${blockDays}::int`,
            ));


        // all five run in one request, as one consistent snapshot
        const [
            [athleteStats],
            [meetCounts],
            nextMeetRows,
            [paymentStats],
            [blockStats],
        ] = await db.batch([
            athleteQuery,
            athleteCompetitionsQuery,
            nextMeetQuery,
            paymentQuery,
            blockQuery,
        ]);

        const nextMeet = nextMeetRows[0]; // undefined when nothing is coming up

        return res.status(200).json({
            ...athleteStats,
            retentionUnit,
            ...meetCounts,
            nextAthleteMeetDate: nextMeet?.nextAthleteMeetDate ?? null,
            nextAthleteMeetName: nextMeet?.nextAthleteMeetName ?? null,
            ...paymentStats,
            ...blockStats,
        });

    } catch (err) {
        console.error(`GET /dashboard error ${err}`);
        return res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
import express from "express";
import { and, asc, between, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {athletes, athletesAndCompetitions, competitions} from "../db/schema/index.js";
import { isValidDay, clampDays, daySql } from "../lib/today.js";

const router = express.Router();

const DEFAULT_MEET_DAYS = 30; // "meets in the next X days", meetdays = x
const DEFAULT_BLOCK_DAYS = 4; // "blocks due in the next Y days", blockdays = y
const DEFAULT_RETENTION_TIME_PERIOD_DIVSOR = 365.25; //

router.get("/", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });

        const today = req.query.today;
        if (!isValidDay(today)) return res.status(400).json({ message: "today must be yyyy-mm-dd" });

        const meetDays = clampDays(req.query.meetDays, DEFAULT_MEET_DAYS);
        const blockDays = clampDays(req.query.blockDays, DEFAULT_BLOCK_DAYS);
        //1 for days,7 for weeks, 30.44 for months, 365.25 for years (default is years)
        const retentionTimePeriodDivisor = clampDays(req.query.retentionTimePeriodDivisor, DEFAULT_RETENTION_TIME_PERIOD_DIVSOR);

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
                )::numeric / ${retentionTimePeriodDivisor} .
            0), 2)`.mapWith(Number),
            })
            .from(athletes)
            .where(eq(athletes.coachId, coachId));

        const [athleteStats] = await athleteQuery;

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


        return res.status(200).json({ coachId, today, meetDays, blockDays });
    } catch (err) {
        console.error(`GET /dashboard error ${err}`);
        return res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
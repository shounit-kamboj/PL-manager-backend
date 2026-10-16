import express from 'express';
import {athletesAndCompetitions, athletes, competitions} from '../db/schema/index.js';
import {eq, and, getTableColumns, or, ilike, sql, gte, isNull} from 'drizzle-orm';
import { db } from '../db/index.js';

const router = express.Router();

//show me all athcomps that are current, what user searchs for,sort by comp date
router.get("/", async (req, res) => {
    try {

        const coachId = req.coachId;
        if (coachId === undefined) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const {
            search,
            federation,
            sort,
            order,
            page = 1,
            limit = 10
        } = req.query;

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 10));

        const offset = (currentPage - 1) * limitPerPage;
        const sortableColumns: Record<string, any> = {
            'date': athletesAndCompetitions.date ,
        };

        const sortColumn = sortableColumns[sort as string] ?? athletesAndCompetitions.id;
        const sortOrder = order === 'asc'
            ? sql`${sortColumn} ASC NULLS LAST`
            : sql`${sortColumn} DESC NULLS LAST`;

        const filterConditions = [];

        filterConditions.push(eq(athletes.coachId, coachId));

        filterConditions.push(eq(athletes.deleted, false)); //only show current roster
        filterConditions.push(eq(athletesAndCompetitions.isCurrent,true)) //only show curr comps
        filterConditions.push(eq(athletesAndCompetitions.deleted, false));
        filterConditions.push(gte(athletesAndCompetitions.date, sql`CURRENT_DATE`));

        if (search) {
            filterConditions.push(or(ilike(athletes.name, `%${search}%`)));
        }

        if (federation) {
            filterConditions.push(
                eq(
                    competitions.federation,
                    federation as typeof competitions.federation.enumValues[number]
                )
            );
        }

        const results = await db
            .select({
                ...getTableColumns(athletesAndCompetitions),
                athleteName: athletes.name,
                competition: competitions,
            })
            .from(athletesAndCompetitions)
            .leftJoin(athletes, eq(athletes.id, athletesAndCompetitions.athleteId))
            .leftJoin(competitions, eq(competitions.id, athletesAndCompetitions.compId))
            .where(and(...filterConditions))
            .orderBy(sortOrder, athletesAndCompetitions.id)
            .limit(limitPerPage)
            .offset(offset);

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(athletesAndCompetitions)
            .leftJoin(
                athletes,
                eq(athletes.id, athletesAndCompetitions.athleteId)
            )
            .leftJoin(
                competitions,
                eq(competitions.id, athletesAndCompetitions.compId)
            )
            .where(and(...filterConditions));

        const totalCount = Number(countResult[0]?.count ?? 0);

        res.status(200).json({
            data: results,
            page: currentPage,
            limit: limitPerPage,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limitPerPage)
        });

    }
    catch (err) {
        console.log(`GET /athletesandcompetitions error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }

});

const orNull = (v: any) => (v === undefined || v === null || v === "" ? null : v);
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const outsideComp = (d: Date, comp: { startDate: Date; endDate: Date }) =>
    dayStr(d) < dayStr(comp.startDate) || dayStr(d) > dayStr(comp.endDate);

router.post("/", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });

        const { athleteId, compId, date, weighInTime, equipment } = req.body ?? {};
        const athleteIdNum = Number(athleteId);
        const compIdNum = Number(compId);
        if (!Number.isInteger(athleteIdNum) || !Number.isInteger(compIdNum)) {
            return res.status(400).json({ message: "athleteId and compId are required" });
        }
        if (equipment && !athletesAndCompetitions.equipment.enumValues.includes(equipment)) {
            return res.status(400).json({ message: "Invalid equipment" });
        }
        if (weighInTime && !TIME_RE.test(weighInTime)) {
            return res.status(400).json({ message: "Invalid weigh-in time" });
        }
        let meetDate: Date | null = null;
        if (date) {
            meetDate = new Date(date);
            if (isNaN(meetDate.getTime())) return res.status(400).json({ message: "Invalid date" });
        }

        // the athlete must be yours and not deleted
        const [athlete] = await db.select({ id: athletes.id }).from(athletes)
            .where(and(eq(athletes.id, athleteIdNum), eq(athletes.coachId, coachId), eq(athletes.deleted, false)));
        if (!athlete) return res.status(404).json({ message: "Athlete not found" });

        // the competition must exist, not be deleted, and be shared or yours
        const [comp] = await db.select({
            id: competitions.id,
            startDate: competitions.startDate,
            endDate: competitions.endDate,
        }).from(competitions)
            .where(and(
                eq(competitions.id, compIdNum),
                eq(competitions.deleted, false),
                or(isNull(competitions.createdByCoachId), eq(competitions.createdByCoachId, coachId)),
            ));
        if (!comp) return res.status(404).json({ message: "Competition not found" });

        // the meet date must fall inside the competition's dates
        if (meetDate && outsideComp(meetDate, comp)) {
            return res.status(400).json({
                message: `Date must be between ${dayStr(comp.startDate)} and ${dayStr(comp.endDate)}`,
            });
        }

        const [created] = await db.insert(athletesAndCompetitions).values({
            athleteId: athleteIdNum,
            coachId,
            compId: compIdNum,
            date: meetDate ?? comp.startDate,
            weighInTime: orNull(weighInTime),
            equipment: orNull(equipment),
        }).returning({ id: athletesAndCompetitions.id });

        res.status(201).json({ data: created });
    } catch (err) {
        console.error(`POST /athlete-competitions error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});

// ---------- READ ONE ----------
router.get("/:id", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id" });

        const [row] = await db
            .select({
                ...getTableColumns(athletesAndCompetitions),
                athleteName: athletes.name,
                competition: competitions,
            })
            .from(athletesAndCompetitions)
            .leftJoin(athletes, eq(athletes.id, athletesAndCompetitions.athleteId))
            .leftJoin(competitions, eq(competitions.id, athletesAndCompetitions.compId))
            .where(and(
                eq(athletesAndCompetitions.id, id),
                eq(athletesAndCompetitions.coachId, coachId),
                eq(athletesAndCompetitions.deleted, false),
            ));

        if (!row) return res.status(404).json({ message: "Entry not found" });
        res.status(200).json({ data: row });
    } catch (err) {
        console.error(`GET /athlete-competitions/:id error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});

// ---------- UPDATE (date, weigh-in, equipment only) ----------
router.put("/:id", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id" });

        const { date, weighInTime, equipment } = req.body ?? {};
        if (equipment && !athletesAndCompetitions.equipment.enumValues.includes(equipment)) {
            return res.status(400).json({ message: "Invalid equipment" });
        }
        if (weighInTime && !TIME_RE.test(weighInTime)) {
            return res.status(400).json({ message: "Invalid weigh-in time" });
        }
        let meetDate: Date | null = null;
        if (date) {
            meetDate = new Date(date);
            if (isNaN(meetDate.getTime())) return res.status(400).json({ message: "Invalid date" });
        }

        // load the entry's competition dates (also checks it is yours and not deleted)
        const [existing] = await db
            .select({ startDate: competitions.startDate, endDate: competitions.endDate })
            .from(athletesAndCompetitions)
            .innerJoin(competitions, eq(competitions.id, athletesAndCompetitions.compId))
            .where(and(
                eq(athletesAndCompetitions.id, id),
                eq(athletesAndCompetitions.coachId, coachId),
                eq(athletesAndCompetitions.deleted, false),
            ));
        if (!existing) return res.status(404).json({ message: "Entry not found" });

        // the meet date must fall inside the competition's dates
        if (meetDate && outsideComp(meetDate, existing)) {
            return res.status(400).json({
                message: `Date must be between ${dayStr(existing.startDate)} and ${dayStr(existing.endDate)}`,
            });
        }

        const [updated] = await db.update(athletesAndCompetitions)
            .set({ date: meetDate ?? existing.startDate, weighInTime: orNull(weighInTime), equipment: orNull(equipment) })
            .where(and(
                eq(athletesAndCompetitions.id, id),
                eq(athletesAndCompetitions.coachId, coachId),
                eq(athletesAndCompetitions.deleted, false),
            ))
            .returning();

        if (!updated) return res.status(404).json({ message: "Entry not found" });
        res.status(200).json({ data: updated });
    } catch (err) {
        console.error(`PUT /athlete-competitions/:id error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id" });

        const [row] = await db.update(athletesAndCompetitions)
            .set({ deleted: true, deletedAt: new Date(), isCurrent: false })
            .where(and(
                eq(athletesAndCompetitions.id, id),
                eq(athletesAndCompetitions.coachId, coachId),
                eq(athletesAndCompetitions.deleted, false),
            ))
            .returning({ id: athletesAndCompetitions.id });

        if (!row) return res.status(404).json({ message: "Entry not found" });
        res.status(200).json({ data: row });
    } catch (err) {
        console.error(`DELETE /athlete-competitions/:id error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
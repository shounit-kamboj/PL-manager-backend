import express from 'express';
import {competitions, athletesAndCompetitions} from '../db/schema/index.js';
import {and, or, ilike, sql, gte, lt, gt, eq, isNull, getTableColumns} from 'drizzle-orm';
import { db } from '../db/index.js';
import { todaySql } from '../lib/today.js';


const router = express.Router();

const FEDS = competitions.federation.enumValues;
type Fed = typeof FEDS[number];

const orNull = (v: any) =>
    v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim();

type CompetitionInput = {
    name: string;
    startDate: Date;
    endDate: Date;
    country: string | null;
    city: string | null;
    province: string | null;
    link: string | null;
    federation: Fed | null;
};

// shared validation for create and edit
const parseCompetitionBody = (body: any): { error: string } | { values: CompetitionInput } => {
    const { name, startDate, endDate, country, city, province, link, federation } = body ?? {};

    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName || cleanName.length > 255) {
        return { error: "Name is required (max 255 characters)" };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!startDate || !endDate || isNaN(start.getTime()) || isNaN(end.getTime())) {
        return { error: "Valid start and end dates are required" };
    }
    if (end < start) {
        return { error: "End date can't be before the start date" };
    }

    if (federation && !FEDS.includes(federation)) {
        return { error: "Invalid federation" };
    }

    const cleanLink = orNull(link);
    if (cleanLink && (cleanLink.length > 200 || !/^https?:\/\//i.test(cleanLink))) {
        return { error: "Link must start with http:// or https:// (max 200 characters)" };
    }

    if ([country, city, province].some((v) => v && String(v).trim().length > 100)) {
        return { error: "Country, city and province must be 100 characters or less" };
    }

    return {
        values: {
            name: cleanName,
            startDate: start,
            endDate: end,
            country: orNull(country),
            city: orNull(city),
            province: orNull(province),
            link: cleanLink,
            federation: (federation || null) as Fed | null,
        },
    };
};

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
            'startDate': competitions.startDate ,
        };

        const sortColumn = sortableColumns[sort as string] ?? competitions.id;
        const sortOrder = order === 'asc'
            ? sql`${sortColumn} ASC NULLS LAST`
            : sql`${sortColumn} DESC NULLS LAST`;

        const filterConditions = [];

        // shared (official) competitions, plus this coach's own custom ones
        filterConditions.push(
            or(
                isNull(competitions.createdByCoachId),
                eq(competitions.createdByCoachId, coachId)
            )
        );

        // hide soft-deleted competitions
        filterConditions.push(eq(competitions.deleted, false));

        filterConditions.push(gte(competitions.endDate, todaySql(req)));

        if (search) {
            filterConditions.push(or(ilike(competitions.name, `%${search}%`)));
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
                ...getTableColumns(competitions),
                // true only for this coach's own custom competitions (the UI shows Edit when true)
                isOwn: sql<boolean>`COALESCE(${competitions.createdByCoachId} = ${coachId}, false)`,
            })
            .from(competitions)
            .where(and(...filterConditions))
            .orderBy(sortOrder)
            .limit(limitPerPage)
            .offset(offset);

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(competitions)
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
        console.log(`GET /competitions error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }


})

// a coach creates their own custom competition (private to them)
router.post("/", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });

        const parsed = parseCompetitionBody(req.body);
        if ("error" in parsed) return res.status(400).json({ message: parsed.error });

        const [created] = await db.insert(competitions).values({
            ...parsed.values,
            createdByCoachId: coachId, // from the session, never from the body
        }).returning();

        res.status(201).json({ data: created });
    } catch (err) {
        console.error(`POST /competitions error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});

// a coach edits one of THEIR OWN custom competitions (shared ones and other coaches' return 404)
router.put("/:id", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id" });

        const [existing] = await db.select({ id: competitions.id }).from(competitions)
            .where(and(
                eq(competitions.id, id),
                eq(competitions.createdByCoachId, coachId),
                eq(competitions.deleted, false),
            ));
        if (!existing) return res.status(404).json({ message: "Competition not found" });

        const parsed = parseCompetitionBody(req.body);
        if ("error" in parsed) return res.status(400).json({ message: parsed.error });
        const { values } = parsed;

        // don't let the new dates strand existing meet entries outside the competition's range
        const [outside] = await db
            .select({ count: sql<number>`count(*)` })
            .from(athletesAndCompetitions)
            .where(and(
                eq(athletesAndCompetitions.compId, id),
                eq(athletesAndCompetitions.deleted, false),
                or(
                    lt(athletesAndCompetitions.date, values.startDate),
                    gt(athletesAndCompetitions.date, values.endDate),
                ),
            ));
        const outsideCount = Number(outside?.count ?? 0);
        if (outsideCount > 0) {
            return res.status(409).json({
                message: `${outsideCount} meet ${outsideCount === 1 ? "entry has a date" : "entries have dates"} outside the new range. Update ${outsideCount === 1 ? "it" : "them"} first.`,
            });
        }

        const [updated] = await db.update(competitions)
            .set(values)
            .where(and(
                eq(competitions.id, id),
                eq(competitions.createdByCoachId, coachId),
                eq(competitions.deleted, false),
            ))
            .returning();

        if (!updated) return res.status(404).json({ message: "Competition not found" });
        res.status(200).json({ data: updated });
    } catch (err) {
        console.error(`PUT /competitions/:id error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});

// soft delete one of THIS coach's custom competitions (blocked while meet entries still use it)
router.delete("/:id", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id" });

        const ownLive = and(
            eq(competitions.id, id),
            eq(competitions.createdByCoachId, coachId),
            eq(competitions.deleted, false),
        );

        const [existing] = await db.select({ id: competitions.id }).from(competitions).where(ownLive);
        if (!existing) return res.status(404).json({ message: "Competition not found" });

        // refuse while live meet entries still use it
        const [inUse] = await db
            .select({ count: sql<number>`count(*)` })
            .from(athletesAndCompetitions)
            .where(and(
                eq(athletesAndCompetitions.compId, id),
                eq(athletesAndCompetitions.deleted, false),
            ));
        const usedBy = Number(inUse?.count ?? 0);
        if (usedBy > 0) {
            return res.status(409).json({
                message: `${usedBy} meet ${usedBy === 1 ? "entry uses" : "entries use"} this competition. Delete ${usedBy === 1 ? "it" : "them"} first.`,
            });
        }

        const [row] = await db.update(competitions)
            .set({ deleted: true, deletedAt: new Date() })
            .where(ownLive)
            .returning({ id: competitions.id });

        if (!row) return res.status(404).json({ message: "Competition not found" });
        res.status(200).json({ data: row });
    } catch (err) {
        console.error(`DELETE /competitions/:id error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
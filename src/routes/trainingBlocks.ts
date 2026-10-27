import express from 'express';
import { trainingBlocks, athletes } from '../db/schema/index.js';
import { eq, and, ilike, sql, getTableColumns, or, gt, lt, ne } from 'drizzle-orm';
import { db } from '../db/index.js';

const router = express.Router();

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// validate and clean req.body for create and edit; return { error } or { values }
type TrainingBlockInput = {
    name: string;
    startDate: Date;
    endDate: Date;
    lastUpdate: Date;
    daysBetweenUpdates: number;
    link: string | null;
};

// "2026-10-25" (or a full ISO string) -> Date, or null if it isn't a real date
const parseDayStr = (v: unknown): Date | null => {
    const day = typeof v === "string" ? v.slice(0, 10) : "";
    const d = new Date(day);
    if (!DAY_RE.test(day) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day) {
        return null;
    }
    return d;
};
// the client's local date if valid, else today's UTC date, as a Date at midnight
const clientToday = (v: unknown): Date =>
    parseDayStr(v) ?? new Date(new Date().toISOString().slice(0, 10));

const parseTrainingBlockBody = (
    body: any,
): { error: string } | { values: TrainingBlockInput } => {
    const { name, startDate, endDate, lastUpdate, daysBetweenUpdates, link } = body ?? {};

    // name: required, trimmed, max 100
    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName || cleanName.length > 100) {
        return { error: "Block name is required (max 100 characters)" };
    }

    // dates: all three required and real
    const start = parseDayStr(startDate);
    if (!start) return { error: "A valid start date is required (yyyy-mm-dd)" };

    const end = parseDayStr(endDate);
    if (!end) return { error: "A valid end date is required (yyyy-mm-dd)" };

    const last = parseDayStr(lastUpdate);
    if (!last) return { error: "A valid last update date is required (yyyy-mm-dd)" };

    if (end < start) {
        return { error: "End date can't be before the start date" };
    }


    const days = Number(daysBetweenUpdates);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
        return { error: "Days between updates must be a whole number from 1 to 365" };
    }


    const rawLink = typeof link === "string" ? link.trim() : "";
    const cleanLink = rawLink === "" ? null : rawLink;
    if (cleanLink && cleanLink.length > 200 ) {
        return { error: "max 200 characters" };
    }

    return {
        values: {
            name: cleanName,
            startDate: start,
            endDate: end,
            lastUpdate: last,
            daysBetweenUpdates: days,
            link: cleanLink,
        },
    };
};

const isUniqueViolation = (err: unknown): boolean => {
    const codeOf = (e: unknown): unknown =>
        typeof e === "object" && e !== null && "code" in e
            ? (e as { code: unknown }).code
            : undefined;

    const cause =
        typeof err === "object" && err !== null && "cause" in err
            ? (err as { cause: unknown }).cause
            : undefined;

    return codeOf(err) === "23505" || codeOf(cause) === "23505";
};


const findOwnedAthlete = async (athleteId: number, coachId: number) => {
    const [athlete] = await db
        .select({ id: athletes.id })
        .from(athletes)
        .where(and(
            eq(athletes.id, athleteId),
            eq(athletes.coachId, coachId),
            eq(athletes.deleted, false),
        ));
    return athlete;
};

router.get("/", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined){
            return res.status(401).json({ message: "Unauthorized" });
        }

        const {
            search,
            isCurrent,
            sort,
            order,
            page = 1,
            limit = 10
        } = req.query;

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(100, Math.max(1, Number(limit) || 10));
        const offset = (currentPage - 1) * limitPerPage;

        const sortableColumns: Record<string, any> = {
            'startDate': trainingBlocks.startDate,
            'endDate': trainingBlocks.endDate,
            'lastUpdate': trainingBlocks.lastUpdate,
            'nextUpdate': sql`${trainingBlocks.lastUpdate} + (${trainingBlocks.daysBetweenUpdates} * interval '1 day')`,
        };

        const sortColumn = sortableColumns[sort as string] ?? trainingBlocks.id;
        const sortOrder = order === 'asc'
            ? sql`${sortColumn} ASC NULLS LAST`
            : sql`${sortColumn} DESC NULLS LAST`;

        const filterConditions = [];

        filterConditions.push(eq(athletes.deleted, false));
        filterConditions.push(eq(athletes.coachId, coachId));
        filterConditions.push(eq(trainingBlocks.deleted, false));


        if (search) {
            filterConditions.push(or(
                ilike(athletes.name, `%${search}%`),
                ilike(trainingBlocks.name, `%${search}%`),
            ));
        }

        if (isCurrent !== undefined) {
            filterConditions.push(eq(trainingBlocks.isCurrent, isCurrent === 'true'));
        }

        const results = await db
            .select({
                ...getTableColumns(trainingBlocks),
                athleteName: athletes.name,
            })
            .from(trainingBlocks)
            .leftJoin(athletes, eq(athletes.id, trainingBlocks.athleteId))
            .where(and(...filterConditions))
            .orderBy(sortOrder, trainingBlocks.id)
            .limit(limitPerPage)
            .offset(offset);

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(trainingBlocks)
            .leftJoin(athletes, eq(athletes.id, trainingBlocks.athleteId))
            .where(and(...filterConditions));

        const totalCount = countResult[0]?.count ?? 0;

        res.status(200).json({
            data: results,
            page: currentPage,
            limit: limitPerPage,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limitPerPage)
        });
    }
    catch (err) {
        console.log(`GET /training-blocks error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});

// one training block, with athlete name
router.get("/:id", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id" });

        const [row] = await db
            .select({
                ...getTableColumns(trainingBlocks),
                athleteName: athletes.name,
            })
            .from(trainingBlocks)
            .leftJoin(athletes, eq(athletes.id, trainingBlocks.athleteId))
            .where(and(
                eq(trainingBlocks.id, id),
                eq(trainingBlocks.coachId, coachId),
                eq(trainingBlocks.deleted, false),
                eq(athletes.deleted, false),
            ));

        if (!row) return res.status(404).json({ message: "Training block not found" });

        res.status(200).json({ data: row });
    }
    catch (err) {
        console.error(`GET /training-blocks/:id error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});

// create a training block; the athlete's previous current block becomes past
router.post("/", async (req, res) => {
    // TODO: 401 if no coachId
    try{
        const coachId = req.coachId;
        if(coachId == undefined) return res.status(401).json({ message: "Unauthorized" });

        const parsedInfo = parseTrainingBlockBody(req.body);
        if ("error" in parsedInfo) return res.status(400).json({ message: parsedInfo.error });
        const { values } = parsedInfo;

        const athleteId = Number(req.body?.athleteId);
        if (!Number.isInteger(athleteId) || athleteId <= 0) {
            return res.status(400).json({ message: "A valid athlete is required" });
        }

        const athlete = await findOwnedAthlete(athleteId, coachId);
        if (!athlete) return res.status(404).json({ message: "Athlete not found" });

        const [prevBlockOverlaps] = await db
            .select({ id: trainingBlocks.id, name: trainingBlocks.name })
            .from(trainingBlocks)
            .where(and(
                eq(trainingBlocks.athleteId, athleteId),
                eq(trainingBlocks.coachId, coachId),
                eq(trainingBlocks.deleted,false),
                gt(trainingBlocks.endDate, values.startDate),
                lt(trainingBlocks.startDate, values.endDate)
            ));

        if (prevBlockOverlaps) {
            return res.status(409).json({
                message: `These dates overlap "${prevBlockOverlaps.name}". Change the dates or edit that block first.`,
            });
        }

        const isPast = values.endDate < clientToday(req.body?.today);

        if (isPast) {
            // an already-ended block is saved as past and leaves the current block alone
            const [created] = await db
                .insert(trainingBlocks)
                .values({ ...values, athleteId, coachId, isCurrent: false })
                .returning();
            return res.status(201).json({ data: created });
        }

        const [, inserted] = await db.batch([
            db.update(trainingBlocks)
                .set({ isCurrent: false })
                .where(and(
                    eq(trainingBlocks.athleteId, athleteId),
                    eq(trainingBlocks.coachId, coachId),
                    eq(trainingBlocks.isCurrent, true),
                    eq(trainingBlocks.deleted, false),
                )),
            db.insert(trainingBlocks)
                .values({ ...values, athleteId, coachId, isCurrent: true })
                .returning(),
        ]);

        res.status(201).json({ data: inserted[0] });


    }
    catch (err) {
        // unique index training_blocks_one_current was hit (double-click / race)
        if (isUniqueViolation(err)) {
            return res.status(409).json({ message: "A block was just added for this athlete. Refresh and try again." });
        }
        console.error(`POST /training-blocks error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }

});

router.put("/:id", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });

        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id" });

        const parsedInfo = parseTrainingBlockBody(req.body);
        if ("error" in parsedInfo) return res.status(400).json({ message: parsedInfo.error });
        const { values } = parsedInfo;

        const [existing] = await db
            .select({ id: trainingBlocks.id, athleteId: trainingBlocks.athleteId })
            .from(trainingBlocks)
            .where(and(
                eq(trainingBlocks.id, id),
                eq(trainingBlocks.coachId, coachId),
                eq(trainingBlocks.deleted, false),
            ));
        if (!existing) return res.status(404).json({ message: "Training block not found" });

        // the new dates can't overlap the athlete's other blocks (this block excluded)
        const [overlap] = await db
            .select({ id: trainingBlocks.id, name: trainingBlocks.name })
            .from(trainingBlocks)
            .where(and(
                eq(trainingBlocks.athleteId, existing.athleteId),
                eq(trainingBlocks.coachId, coachId),
                eq(trainingBlocks.deleted, false),
                ne(trainingBlocks.id, id),
                gt(trainingBlocks.endDate, values.startDate),
                lt(trainingBlocks.startDate, values.endDate),
            ));
        if (overlap) {
            return res.status(409).json({
                message: `These dates overlap "${overlap.name}". Change the dates or edit that block first.`,
            });
        }

        const isPast = values.endDate < clientToday(req.body?.today);

        const [updatedBlock] = await db
            .update(trainingBlocks)
            .set(isPast ? { ...values, isCurrent: false } : values)
            .where(and(
                eq(trainingBlocks.id, id),
                eq(trainingBlocks.coachId, coachId),
                eq(trainingBlocks.deleted, false),
            ))
            .returning();

        if (!updatedBlock) return res.status(404).json({ message: "Training block not found" });

        res.status(200).json({ data: updatedBlock });
    }
    catch (err) {
        console.error(`PUT /training-blocks/:id error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});
// soft delete a training block
router.delete("/:id", async (req, res) => {
    try{
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });

        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id" });

        const [deletedBlock] = await db
            .update(trainingBlocks)
            .set({ deleted: true, deletedAt: new Date(), isCurrent:false })
            .where(and(
                eq(trainingBlocks.id, id),
                eq(trainingBlocks.coachId, coachId),
                eq(trainingBlocks.deleted, false),
            ))
            .returning({ id: trainingBlocks.id });

        if (!deletedBlock) return res.status(404).json({ message: "Training block not found" });

        res.status(200).json({ data: deletedBlock });


    }
    catch (err) {
        console.error(`DELETE /training-blocks/:id error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }

});

export default router;
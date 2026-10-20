import express from 'express';
import { payments, athletes } from '../db/schema/index.js';
import { eq, and, ilike, sql, getTableColumns,inArray } from 'drizzle-orm';
import { db } from '../db/index.js';

const router = express.Router();

const PAYMENT_STATUSES = payments.paymentStatus.enumValues;
type PaymentStatus = typeof PAYMENT_STATUSES[number];

type PaymentInput = {
    dueDate: Date;
    paymentStatus?: PaymentStatus; // only present in edit mode
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

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

// shared validation: mode "create" ignores status, mode "edit" requires it
const parsePaymentBody = (
    body: any,
    mode: "create" | "edit",
): { error: string } | { values: PaymentInput } => {
    const { dueDate, paymentStatus } = body ?? {};

    // due date: required, yyyy-mm-dd (a full ISO string is accepted and trimmed to the day)
    const day = typeof dueDate === "string" ? dueDate.slice(0, 10) : "";
    const due = new Date(day);
    if (!DAY_RE.test(day) || isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== day) {
        return { error: "A valid due date is required (yyyy-mm-dd)" };
    }

    // create: status is never taken from the body; the DB default ('unpaid') applies
    if (mode === "create") {
        return { values: { dueDate: due } };
    }

    // edit: status is required and must be a real enum value
    if (!PAYMENT_STATUSES.includes(paymentStatus)) {
        return { error: "A valid payment status is required" };
    }

    return { values: { dueDate: due, paymentStatus: paymentStatus as PaymentStatus } };
};

// confirm the athlete exists, belongs to this coach and is not deleted
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
        if (coachId === undefined) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const {
            search,
            paymentStatus,
            isCurrent,
            sort,
            order,
            page = 1,
            limit = 10
        } = req.query;

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 10));
        const offset = (currentPage - 1) * limitPerPage;

        const sortableColumns: Record<string, any> = {
            'dueDate': payments.dueDate,
        };

        const sortColumn = sortableColumns[sort as string] ?? payments.id;
        const sortOrder = order === 'asc'
            ? sql`${sortColumn} ASC NULLS LAST`
            : sql`${sortColumn} DESC NULLS LAST`;

        const filterConditions = [];

        filterConditions.push(eq(payments.coachId, coachId));
        filterConditions.push(eq(athletes.deleted, false));
        filterConditions.push(eq(payments.deleted, false));

        if (search) {
            filterConditions.push(ilike(athletes.name, `%${search}%`));
        }

        if (paymentStatus) {
            filterConditions.push(
                eq(payments.paymentStatus, paymentStatus as typeof payments.paymentStatus.enumValues[number])
            );
        }

        if (isCurrent !== undefined) {
            filterConditions.push(eq(payments.isCurrent, isCurrent === 'true'));
        }

        const results = await db
            .select({
                ...getTableColumns(payments),
                athleteName: athletes.name,
                amount: athletes.paymentPrice,
            })
            .from(payments)
            .leftJoin(athletes, eq(athletes.id, payments.athleteId))
            .where(and(...filterConditions))
            .orderBy(sortOrder,payments.id)
            .limit(limitPerPage)
            .offset(offset);

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(payments)
            .leftJoin(athletes, eq(athletes.id, payments.athleteId))
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
        console.log(`GET /payments error ${err}`);
        res.status(500).json({ message: "Internal server error" });

    }
});

// one payment, with athlete name
router.get("/:id", async (req, res) => {
    // TODO: 401, validate id (400), query scoped by coachId + not deleted, 404 if missing
    try{
        const coachId =  req.coachId;
        if(coachId == undefined)  return res.status(401).json({ message: "Unauthorized" });

        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id" });

        const [row] = await db
            .select({
                ...getTableColumns(payments),
                athleteName: athletes.name,
                amount: athletes.paymentPrice,
            })
            .from(payments)
            .leftJoin(athletes, eq(athletes.id,payments.athleteId))
            .where(and(
                eq(payments.id, id),
                eq(payments.coachId, coachId),
                eq(payments.deleted, false),
            ));

        if (!row) return res.status(404).json({ message: "Payment not found" });
        res.status(200).json({ data: row });
    }
    catch (err) {
        console.error(`GET /payments/:id error ${err}`);
        res.status(500).json({ message: "Internal server error" });
        
    }
});

// create a payment; the athlete's previous current payment becomes not current
router.post("/", async (req, res) => {
    try{
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });

        const parsedInfo = parsePaymentBody(req.body,"create");
        if ("error" in parsedInfo) return res.status(400).json({ message: parsedInfo.error });
        const { values } = parsedInfo;

        const athleteId = Number(req.body?.athleteId);
        if (!Number.isInteger(athleteId) || athleteId <= 0) {
            return res.status(400).json({ message: "A valid athlete is required" });
        }

        const athlete = await findOwnedAthlete(athleteId, coachId);
        if (!athlete) return res.status(404).json({ message: "Athlete not found" });

        // block a new payment while the athlete's current one is still unpaid or overdue
        const [openPayment] = await db
            .select({ id: payments.id, paymentStatus: payments.paymentStatus })
            .from(payments)
            .where(and(
                eq(payments.athleteId, athleteId),
                eq(payments.isCurrent, true),
                eq(payments.deleted, false),
                inArray(payments.paymentStatus, ["unpaid", "overdue"]),
            ));

        if (openPayment) {
            return res.status(409).json({
                message: `This athlete's current payment is still ${openPayment.paymentStatus}. Mark it as paid (or delete it) before adding a new one.`,
            });
        }

        // one atomic batch: statement 1 turns the old current payment off,
        // statement 2 inserts the new one (order matters for the unique index)
        const [, inserted] = await db.batch([
            db.update(payments)
                .set({ isCurrent: false })
                .where(and(
                    eq(payments.athleteId, athleteId),
                    eq(payments.isCurrent, true),
                    eq(payments.deleted, false),
                )),
            db.insert(payments)
                .values({
                    ...values,
                    athleteId,
                    coachId,
                    isCurrent: true,
                })
                .returning(),
        ]);

        res.status(201).json({ data: inserted[0] });
    }
    catch (err) {
        // unique index payments_one_current was hit (double-click / race)
        if (isUniqueViolation(err)) {
            return res.status(409).json({ message: "A payment was just added for this athlete. Refresh and try again." });
        }
        console.error(`POST /payments error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});

// edit a payment (due date and status; athlete is not editable)
router.put("/:id", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id" });

        const parsedInfo = parsePaymentBody(req.body, "edit");
        if ("error" in parsedInfo) return res.status(400).json({ message: parsedInfo.error });
        const { values } = parsedInfo;

        const [updatedPayment] = await db
            .update(payments)
            .set(values)
            .where(and(
                eq(payments.id, id),
                eq(payments.coachId, coachId),
                eq(payments.deleted, false),
            ))
            .returning();

        if (!updatedPayment) return res.status(404).json({ message: "Payment not found" });

        res.status(200).json({ data: updatedPayment });
    }
    catch (err) {
        console.error(`PUT /payments/:id error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});
// soft delete a payment
router.delete("/:id", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({message: "Unauthorized"});

        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({message: "Invalid id"});

        const [row] = await db
            .update(payments)
            .set({deleted: true, deletedAt: new Date(), isCurrent: false})
            .where(and(
                eq(payments.id, id),
                eq(payments.coachId, coachId),
                eq(payments.deleted, false),
            ))
            .returning({id: payments.id});

        if (!row) return res.status(404).json({message: "Payment not found"});
        res.status(200).json({data: row});
    }
    catch (err) {
        console.error(`DELETE /payments/:id error ${err}`);
        res.status(500).json({ message: "Internal server error" });

    }


});


export default router;
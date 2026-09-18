import express from 'express';
import { payments, athletes } from '../db/schema';
import { eq, and, or, ilike, sql, getTableColumns, asc, desc } from 'drizzle-orm';
import { db } from '../db/index.js';

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        // if (!req.user) {
        //     return res.status(401).json({ message: "Unauthorized" });
        // }

        const {
            search,
            paymentStatus,
            isCurrent,
            sort,
            order,
            page = 1,
            limit = 10
        } = req.query;

        const currentPage = Math.max(1, Number(page));
        const limitPerPage = Math.min(100, Math.max(1, Number(limit) || 10));
        const offset = (currentPage - 1) * limitPerPage;

        const sortableColumns: Record<string, any> = {
            'dueDate': payments.dueDate,
        };

        const sortColumn = sortableColumns[sort as string] ?? payments.id;
        const sortOrder = order === 'asc'
            ? sql`${sortColumn} ASC NULLS LAST`
            : sql`${sortColumn} DESC NULLS LAST`;

        const filterConditions = [];

        filterConditions.push(eq(athletes.deleted, false));

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
            .orderBy(sortOrder)
            .limit(limitPerPage)
            .offset(offset);

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(payments)
            .leftJoin(athletes, eq(athletes.id, payments.athleteId))
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
        console.log(`GET /payments error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
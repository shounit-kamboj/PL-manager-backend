import express from 'express';
import {competitions} from '../db/schema';
import { and,  or, ilike, sql, gte} from 'drizzle-orm';
import { db } from '../db';


const router = express.Router();

//show me all athcomps that are current, what user searchs for,sort by comp date
router.get("/", async (req, res) => {
    try {
        const {
            search,
            sort,
            order,
            page = 1,
            limit = 10
        } = req.query;

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;
        const sortableColumns: Record<string, any> = {
            'startDate': competitions.startDate ,
        };

        const sortColumn = sortableColumns[sort as string] ?? competitions.id;
        const sortOrder = order === 'asc'
            ? sql`${sortColumn} ASC NULLS LAST`
            : sql`${sortColumn} DESC NULLS LAST`;

        const filterConditions = [];

        filterConditions.push(gte(competitions.endDate, sql`CURRENT_DATE`));

        if (search) {
            filterConditions.push(or(ilike(competitions.name, `%${search}%`)));
        }

        const results = await db
            .select()
            .from(competitions)
            .where(and(...filterConditions))
            .orderBy(sortOrder)
            .limit(limitPerPage)
            .offset(offset);

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(competitions)
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
        console.log(`GET /competitions error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }


})
export default router;



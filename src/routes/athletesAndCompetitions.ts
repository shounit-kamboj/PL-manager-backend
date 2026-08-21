import express from 'express';
import {athletesAndCompetitions, athletes, competitions, payments, trainingBlocks} from '../db/schema';
import {eq, and, getTableColumns, or, ilike, sql, desc, gte} from 'drizzle-orm';
import { db } from '../db';

const router = express.Router();

//show me all athcomps that are current, what user searchs for,sort by comp date
router.get("/", async (req, res) => {
    try {
        const {
            search,
            federation,
            sort,
            order,
            page = 1,
            limit = 10
        } = req.query;

        console.log("here");
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

        //CHANGE LATER
        // filterConditions.push(eq(athletes.coachId, req.user.id));

        filterConditions.push(eq(athletes.deleted, false)); //only show current roster
        filterConditions.push(eq(athletesAndCompetitions.isCurrent,true)) //only show curr comps
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
            .orderBy(sortOrder)
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
        console.log(`GET /athletesandcompetitions error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }

})

export default router;


import express from 'express';
import { athletes, payments, trainingBlocks} from '../db/schema';
import { eq, and, or, ilike, gte, lte, sql, getTableColumns, desc } from 'drizzle-orm';
import { db } from '../db';

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        ///CHNAGE LATER
        // if (!req.user) {
        //     return res.status(401).json({ message: "Unauthorized" });
        // }

        const {
            search,
            gender,
            weightClass,
            ageClass,
            paymentStatus,
            sort,
            order,
            page = 1,
            limit = 10
        } = req.query;

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;
        const sortableColumns: Record<string, any> = {
            'name': athletes.name,
            'dateOfBirth': athletes.dateOfBirth,
            'weightClass': athletes.weightClass,
            'payment.dueDate': payments.dueDate,
            'trainingBlock.nextUpdateDate': sql`${trainingBlocks.lastUpdate} + (${trainingBlocks.daysBetweenUpdates} * interval '1 day')`,
            'meetPrSquat': athletes.meetPrSquat,
            'meetPrBench': athletes.meetPrBench,
            'meetPrDeadlift': athletes.meetPrDeadlift,
            'meetPrTotal': athletes.meetPrTotal,
        };

        const sortColumn = sortableColumns[sort as string] ?? athletes.id;
        const sortOrder = order === 'asc'
            ? sql`${sortColumn} ASC NULLS LAST`
            : sql`${sortColumn} DESC NULLS LAST`;

        const filterConditions = [];

        //CHANGE LATER
        // filterConditions.push(eq(athletes.coachId, req.user.id));
        filterConditions.push(eq(athletes.deleted, false)); //only show current roster

        if (search) {
            filterConditions.push(or(ilike(athletes.name, `%${search}%`)));
        }

        if (gender) {
            filterConditions.push(
                eq(athletes.gender, gender as typeof athletes.gender.enumValues[number])
            );
        }

        if (weightClass) {
            filterConditions.push(
                eq(athletes.weightClass, weightClass as typeof athletes.weightClass.enumValues[number])
            );
        }

        if (ageClass) {
            const ageString = ageClass as string;
            const currentYear = new Date().getFullYear();
            let minAge = 0;
            let maxAge = 0;

            if (ageString === 'SJR') { minAge = 0;  maxAge = 18; }
            if (ageString === 'JR')  { minAge = 19; maxAge = 23; }
            if (ageString === 'O')   { minAge = 24; maxAge = 39; }
            if (ageString === 'M1')  { minAge = 40; maxAge = 49; }
            if (ageString === 'M2')  { minAge = 50; maxAge = 59; }
            if (ageString === 'M3')  { minAge = 60; maxAge = 69; }
            if (ageString === 'M4')  { minAge = 70; maxAge = 120; }

            const minBirthYear = currentYear - maxAge;
            const maxBirthYear = currentYear - minAge;

            filterConditions.push(gte(athletes.dateOfBirth, new Date(`${minBirthYear}-01-01`)));
            filterConditions.push(lte(athletes.dateOfBirth, new Date(`${maxBirthYear}-12-31`)));
        }
        if (paymentStatus) {
            filterConditions.push(eq(payments.paymentStatus, paymentStatus as typeof payments.paymentStatus.enumValues[number]));
        }


        const results = await db
            .select({
                ...getTableColumns(athletes),
                payment: payments,
                trainingBlock: trainingBlocks,
            })
            .from(athletes)
            .leftJoin(payments, and(
                eq(payments.athleteId, athletes.id),
                eq(payments.isCurrent, true)
            ))
            .leftJoin(trainingBlocks, and(
                eq(trainingBlocks.athleteId, athletes.id),
                eq(trainingBlocks.isCurrent, true)
            ))
            .where(and(...filterConditions))
            .orderBy(desc(athletes.isActive), sortOrder)
            .limit(limitPerPage)
            .offset(offset);


        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(athletes)
            .leftJoin(payments, and(
                eq(payments.athleteId, athletes.id),
                eq(payments.isCurrent, true)
            ))
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
        console.log(`GET /athletes error ${err}`);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
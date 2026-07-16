import express from 'express';
import { athletes, payments, trainingBlocks, athletesAndCompetitions, competitions } from '../db/schema';
import { eq, and, or, ilike, gte, lte, sql, getTableColumns, asc, desc } from 'drizzle-orm';
import { db } from '../db';

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        ///CHNAGE LATER
        // if (!req.user) {
        //     return res.status(401).json({ message: "Unauthorized" });
        // }

        const {
            weightClass,
            ageClass,
            search,
            paymentStatus,
            //sort,
            order,
            page = 1,
            limit = 10
        } = req.query;

        const currentPage = Math.max(1, Number(page));
        const limitPerPage = Math.max(1, Number(limit));
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        //CHNAGE LATER
        // filterConditions.push(eq(athletes.coachId, req.user.id));
        filterConditions.push(eq(athletes.deleted, false));

        if (search) {
            const term = `%${search}%`;
            filterConditions.push(or(ilike(athletes.name, term)));
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


        // current training block: the most recently updated one per athlete
        const currentTrainingBlock = db
            .select()
            .from(trainingBlocks)
            .where(eq(trainingBlocks.athleteId, athletes.id))
            .orderBy(desc(trainingBlocks.lastUpdate))
            .limit(1)
            .as('current_training_block');

        // next competition: the closest upcoming one per athlete
        const nextCompetition = db
            .select({
                id: athletesAndCompetitions.id,
                date: athletesAndCompetitions.date,
                weighInTime: athletesAndCompetitions.weighInTime,
                equipment: athletesAndCompetitions.equipment,
                competitionName: competitions.name,
            })
            .from(athletesAndCompetitions)
            .leftJoin(competitions, eq(competitions.id, athletesAndCompetitions.compId))
            .where(
                and(
                    eq(athletesAndCompetitions.athleteId, athletes.id),
                    gte(athletesAndCompetitions.date, sql`CURRENT_DATE`)
                )
            )
            .orderBy(asc(athletesAndCompetitions.date))
            .limit(1)
            .as('next_competition');

        // sorting
        const sortableColumns: Record<string, any> = {
            'name': athletes.name,
            'dateOfBirth': athletes.dateOfBirth,
            'payment.dueDate': payments.dueDate,
            'nextCompetitionDetails.date': nextCompetition.date,
            'trainingBlock.nextUpdateDate': sql`${currentTrainingBlock.lastUpdate} + (${currentTrainingBlock.daysBetweenUpdates} * interval '1 day')`,
        };

       // const sortColumn = sortableColumns[sort as string] ?? athletes.id;
        //const sortOrder = order === 'asc' ? asc(sortColumn) : desc(sortColumn);

        const results = await db
            .select({
                ...getTableColumns(athletes),
                payment: payments,
                trainingBlock: {
                    id: currentTrainingBlock.id,
                    athleteId: currentTrainingBlock.athleteId,
                    coachId: currentTrainingBlock.coachId,
                    startDate: currentTrainingBlock.startDate,
                    endDate: currentTrainingBlock.endDate,
                    lastUpdate: currentTrainingBlock.lastUpdate,
                    daysBetweenUpdates: currentTrainingBlock.daysBetweenUpdates,
                    sendPostBlockOverviewReminder: currentTrainingBlock.sendPostBlockOverviewReminder,
                    link: currentTrainingBlock.link,
                },
                nextCompetitionDetails: {
                    id: nextCompetition.id,
                    date: nextCompetition.date,
                    weighInTime: nextCompetition.weighInTime,
                    equipment: nextCompetition.equipment,
                    competitionName: nextCompetition.competitionName,
                },
            })
            .from(athletes)
            .leftJoin(payments, eq(payments.athleteId, athletes.id))
            .leftJoinLateral(currentTrainingBlock, sql`true`)
            .leftJoinLateral(nextCompetition, sql`true`)
            .where(and(...filterConditions))
            .limit(limitPerPage)
            .offset(offset);

        const filteredResults = paymentStatus
            ? results.filter(r => r.payment?.paymentStatus === paymentStatus)
            : results;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(athletes)
            .leftJoin(payments, eq(payments.athleteId, athletes.id))
            .where(and(...filterConditions));

        const totalCount = countResult[0]?.count ?? 0;

        res.status(200).json({
            data: filteredResults,
            page: currentPage,
            limit: limitPerPage,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limitPerPage)
        })

    }
    catch (err) {
        console.log(`GET /athletes error ${err}`);
        // res.status(500).json({ message: "Internal server error" }); ////CHANGE BACK
        res.status(500).json(`GET /athletes error ${err}`);
    }
});

export default router;
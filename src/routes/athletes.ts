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
            search,
            weightClass,
            ageClass,
            paymentStatus,
            //sort,
            order,
            page = 1,
            limit = 10
        } = req.query;

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        //CHNAGE LATER
        // filterConditions.push(eq(athletes.coachId, req.user.id));
        filterConditions.push(eq(athletes.deleted, false));

        if (search) {
            const term = `%${search}%`;
            filterConditions.push(or(ilike(athletes.name, term)));
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

    }
    catch (err) {
        console.log(`GET /athletes error ${err}`);
        // res.status(500).json({ message: "Internal server error" }); ////CHANGE BACK
        res.status(500).json(`GET /athletes error ${err}`);
    }
});

export default router;
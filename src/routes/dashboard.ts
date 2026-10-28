import express from "express";
import { isValidDay, clampDays } from "../lib/today.js";

const router = express.Router();

const DEFAULT_MEET_DAYS = 30; // "meets in the next X days", meetdays = x
const DEFAULT_BLOCK_DAYS = 4; // "blocks due in the next Y days", blockdays = y

router.get("/", async (req, res) => {
    try {
        const coachId = req.coachId;
        if (coachId === undefined) return res.status(401).json({ message: "Unauthorized" });

        const today = req.query.today;
        if (!isValidDay(today)) return res.status(400).json({ message: "today must be yyyy-mm-dd" });

        const meetDays = clampDays(req.query.meetDays, DEFAULT_MEET_DAYS);
        const blockDays = clampDays(req.query.blockDays, DEFAULT_BLOCK_DAYS);

        //

        // temporary: echo the inputs back so we can test the plumbing
        return res.status(200).json({ coachId, today, meetDays, blockDays });
    } catch (err) {
        console.error(`GET /dashboard error ${err}`);
        return res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
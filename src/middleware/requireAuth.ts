import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { coaches } from "../db/schema/index.js";

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
        if (!session) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        let [coach] = await db.select().from(coaches).where(eq(coaches.userId, session.user.id));

        if (!coach) {
            await db.insert(coaches).values({ userId: session.user.id }).onConflictDoNothing();
            [coach] = await db.select().from(coaches).where(eq(coaches.userId, session.user.id));
        }

        if (!coach) {
            return res.status(500).json({ message: "Could not resolve coach profile" });
        }

        req.user = session.user;
        req.session = session.session;
        req.coachId = coach.id;
        next();
    } catch (err) {
        console.error("requireAuth error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};
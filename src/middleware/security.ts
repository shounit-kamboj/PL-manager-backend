import { slidingWindow } from "@arcjet/node";
import type { ArcjetNodeRequest } from "@arcjet/node";
import type { NextFunction, Request, Response } from "express";

import aj from "../config/arcjet.js";

const securityMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (process.env.NODE_ENV === "test") {
        return next();
    }

    try {
        // const isAuthenticated = !!req.user;

        // const limit = isAuthenticated ? 20 : 5;
        // const message = isAuthenticated
        //     ? "Request limit exceeded (20 per minute). Slow down!"
        //     : "Guest request limit exceeded (5 per minute). Please sign in.";

        //temp until auth is done
        const limit = 20
        const message = "Guest request limit exceeded (5 per minute). Please sign in.";

        const client = aj.withRule(
            slidingWindow({
                mode: "LIVE",
                interval: "1m",
                max: limit,
            })
        );

        const arcjetRequest: ArcjetNodeRequest = {
            headers: req.headers,
            method: req.method,
            url: req.originalUrl ?? req.url,
            socket: {
                remoteAddress: req.socket.remoteAddress ?? req.ip ?? "0.0.0.0",
            },
        };

        const decision = await client.protect(arcjetRequest);

        if (decision.isDenied() && decision.reason.isBot()) {
            return res.status(403).json({
                error: "Forbidden",
                message: "Automated requests are not allowed",
            });
        }

        if (decision.isDenied() && decision.reason.isShield()) {
            return res.status(403).json({
                error: "Forbidden",
                message: "Request blocked by security policy",
            });
        }

        if (decision.isDenied() && decision.reason.isRateLimit()) {
            return res.status(429).json({
                error: "Too Many Requests",
                message,
            });
        }

        next();
    } catch (error) {
        console.error("Arcjet middleware error:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Something went wrong with the security middleware.",
        });
    }
};

export default securityMiddleware;
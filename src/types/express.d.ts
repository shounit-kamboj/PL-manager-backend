// src/types/express.d.ts
import { SafeCoach } from '../db/schema';

declare global {
    namespace Express {
        interface Request {
            user?: SafeCoach;
        }
    }
}

export {};

// const authenticate = (req, res, next) => {
//     const decoded = jwt.verify(token, secret);
//     req.user = decoded; // this is what the new rule allows
//     next();
// };
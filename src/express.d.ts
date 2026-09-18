declare global {
    namespace Express {
        interface Request {
            user?: Session['user'];
            session?: Session['session'];
        }
    }
}

export {};
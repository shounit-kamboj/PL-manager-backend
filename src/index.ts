import AgentAPI  from "apminsight";
AgentAPI.config()

import express from 'express';
import athletesRouter from './routes/athletes.js';
import athletesAndCompetitionsRouter from './routes/athletesAndCompetitions.js';
import competitionsRouter from './routes/competitions.js';
import  paymentsRouter from './routes/payments.js'
import trainingBlocksRouter from './routes/trainingBlocks.js';
import securityMiddleware from './middleware/security.js'
import cors from 'cors';
import {toNodeHandler} from "better-auth/node";
import {auth} from "./lib/auth.js";

const app = express();
const PORT = 8000;

if(!process.env.FRONTEND_URL){
  throw new Error('FRONTEND_URL is not set in .env file');
}
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}))

app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json());

app.use(securityMiddleware)

app.use('/api/athletes', athletesRouter)

app.use('/api/athlete-competitions', athletesAndCompetitionsRouter)

app.use('/api/competitions', competitionsRouter)

app.use('/api/payments', paymentsRouter)

app.use('/api/training-blocks', trainingBlocksRouter);



app.get("/", (req: express.Request, res: express.Response) => {
  res.send("Hello, welcome to CollarPL API!");
})

app.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
})

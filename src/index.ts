import express from 'express';
import athletesRouter from './routes/athletes';
import athletesAndCompetitionsRouter from './routes/athletesAndCompetitions';
import competitionsRouter from './routes/competitions';

import cors from 'cors';

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

app.use(express.json());

app.use('/api/athletes', athletesRouter)

app.use('/api/athlete-competitions', athletesAndCompetitionsRouter)

app.use('/api/competitions', competitionsRouter)



app.get("/", (req: express.Request, res: express.Response) => {
  res.send("Hello, welcome to CollarPL API!");
})

app.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
})

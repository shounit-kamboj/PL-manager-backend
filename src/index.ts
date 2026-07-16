import express from 'express';
import athletesRouter from './routes/athletes';

const app = express();
const PORT = 8000;

app.use(express.json());

app.use('/api/athletes', athletesRouter)

app.get("/", (req: express.Request, res: express.Response) => {
  res.send("Hello, welcome to PLManager API!");
})

app.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
})

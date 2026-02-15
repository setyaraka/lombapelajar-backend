import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import competitionRoutes from './routes/competition.routes.js';

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/competitions', competitionRoutes);

app.listen(3000, () => console.log('API running on port 3000'));

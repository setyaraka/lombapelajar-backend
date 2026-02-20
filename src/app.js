import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import competitionRoutes from './routes/competition.routes.js';
import registrationRoutes from './routes/registration.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import adminRoutes from './routes/admin.routes.js';

dotenv.config();
const app = express();

/* ================= CORS ================= */
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

/* ================= PARSER ================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= ROUTES ================= */
app.use('/auth', authRoutes);
app.use('/competitions', competitionRoutes);
app.use('/registrations', registrationRoutes);
app.use('/payments', paymentRoutes);
app.use('/admin', adminRoutes);

/* ================= STATIC FILE ================= */
app.use('/uploads', express.static('uploads'));

/* ================= SERVER ================= */
app.listen(3000, () => console.log('API running on port 3000'));

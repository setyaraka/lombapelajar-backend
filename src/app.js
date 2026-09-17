import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.routes.js';
import competitionRoutes from './routes/competition.routes.js';
import registrationRoutes from './routes/registration.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { proxyFile } from './controllers/file.controller.js';
import { authMiddleware } from './middleware/auth.middleware.js';

dotenv.config();
const app = express();

// Trust the first proxy hop (Nginx on the same host) so req.ip / X-Forwarded-*
// reflect the real client instead of always resolving to 127.0.0.1, which
// would break per-IP rate limiting once behind a reverse proxy.
app.set('trust proxy', 1);

/* ================= SECURITY HEADERS ================= */
app.use(helmet());

/* ================= RATE LIMIT (global backstop) =================
 * Batas longgar karena traffic normal aplikasi ini termasuk autosave
 * jawaban ujian & polling monitoring yang cukup sering per peserta aktif.
 * Ini cuma backstop anti-abuse, bukan pengganti rate limit spesifik di
 * endpoint sensitif (lihat auth.routes.js untuk limiter login/register).
 */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

/* ================= CORS ================= */
const FRONTEND_URLS = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',')
  : ['http://localhost:5173'];

app.use(
  cors({
    origin: FRONTEND_URLS,
    credentials: true,
  }),
);

/* ================= PARSER ================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= ROUTES ================= */
// app.use('/auth', authRoutes);
app.use('/competitions', competitionRoutes);
app.use('/registrations', registrationRoutes);
app.use('/payments', paymentRoutes);
// app.use('/admin', adminRoutes);

app.use('/admin', adminRoutes);
app.use('/auth', authRoutes);

app.get(/^\/files\/(.+)/, authMiddleware, proxyFile);

/* ================= STATIC FILE ================= */
app.use('/uploads', express.static('uploads'));

/* ================= SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('API running on port 3000'));

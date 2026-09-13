import express from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, getMe } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = express.Router();

// Limiter khusus login/register untuk mengurangi brute-force. Dibuat cukup
// longgar (bukan mis. 5/15menit) karena peserta CBT sering login bareng-bareng
// dari satu venue/jaringan sekolah yang keluar sebagai satu IP publik -
// limiter yang terlalu ketat bisa malah mengunci satu venue penuh saat ujian
// mau mulai. Sesuaikan lagi kalau ternyata masih kurang/kelebihan longgar.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak percobaan, coba lagi beberapa saat.' },
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);

router.get('/me', authMiddleware, getMe);

export default router;

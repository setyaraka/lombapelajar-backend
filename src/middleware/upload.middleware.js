import multer from 'multer';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// Filter MIME khusus endpoint yang sudah jelas jenis filenya (bukti
// pembayaran, upload karya peserta): gambar atau PDF. Endpoint lain
// (poster/qris kompetisi, juknis, pengumuman) masih pakai `upload` di atas
// tanpa filter karena tipe filenya belum dikonfirmasi.
const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

export const uploadImageOrPdf = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipe file tidak didukung. Hanya JPG/PNG/PDF yang diperbolehkan.'));
    }
  },
});

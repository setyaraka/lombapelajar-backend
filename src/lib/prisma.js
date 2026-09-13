import { PrismaClient } from '@prisma/client';

// Prisma Client tanpa parameter pool eksplisit memakai default
// `connection_limit` engine (num_cpus * 2 + 1) - tidak masalah untuk dev,
// tapi berisiko saat traffic naik (mis. banyak peserta submit ujian
// bersamaan): Prisma bisa buka koneksi jauh lebih banyak dari yang
// disangka, membebani Postgres/connection pooler di sisi DB.
// Di bawah ini nambahin `connection_limit`/`pool_timeout` ke DATABASE_URL
// kalau belum ada di sana, dengan default yang bisa dioverride lewat env
// tanpa perlu ubah DATABASE_URL manual. Kalau DATABASE_URL tidak di-set
// sama sekali, biarkan Prisma pakai perilaku defaultnya sendiri (biar
// error message bawaan Prisma yang muncul, bukan error dari sini).
function buildDatasourceUrl() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return undefined;

  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', process.env.DB_CONNECTION_LIMIT || '10');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', process.env.DB_POOL_TIMEOUT || '10');
    }
    return url.toString();
  } catch {
    // DATABASE_URL ada tapi gagal di-parse - jangan sok tahu, biar Prisma
    // sendiri yang validasi & lempar error yang jelas.
    return rawUrl;
  }
}

const datasourceUrl = buildDatasourceUrl();

const prisma = datasourceUrl
  ? new PrismaClient({ datasources: { db: { url: datasourceUrl } } })
  : new PrismaClient();

export default prisma;

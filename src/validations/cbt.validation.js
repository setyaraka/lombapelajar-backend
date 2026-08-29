import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const optionalString = z.string().trim().optional().nullable();

export const stageSchema = z.object({
  name: nonEmptyString,
  description: optionalString,
  position: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});

export const examSchema = z.object({
  title: nonEmptyString,
  description: optionalString,
  stageId: z.string().uuid().optional().nullable(),
  competitionId: z.string().uuid().optional().nullable(),
  startAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(1),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']).default('DRAFT'),
  isActive: z.coerce.boolean().default(false),
  maxAttempts: z.coerce.number().int().min(1).default(1),
  randomizeQuestions: z.coerce.boolean().default(true),
  randomizeOptions: z.coerce.boolean().default(true),
  announcementAt: z.coerce.date().optional().nullable(),
  resultPublished: z.coerce.boolean().default(false),
});

export const participantSchema = z.object({
  name: nonEmptyString,
  email: z.string().trim().email(),
  participantNumber: nonEmptyString,
  stageId: z.string().uuid().optional().nullable(),
  isActive: z.coerce.boolean().default(true),
});

export const assignmentSchema = z.object({
  examIds: z.array(z.string().uuid()).min(1).optional(),
  participantIds: z.array(z.string().uuid()).min(1).optional(),
  stageId: z.string().uuid().optional(),
  examId: z.string().uuid().optional(),
  competitionId: z.string().uuid().optional(),
  sourceStageId: z.string().uuid().optional(),
});

export const questionSchema = z.object({
  examId: z.string().uuid(),
  text: nonEmptyString,
  type: z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'ESSAY']).default('SINGLE_CHOICE'),
  points: z.coerce.number().int().min(1).max(10).optional(),
  position: z.coerce.number().int().min(0).default(0),
  options: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        text: z.string().trim().optional().default(''),
        isCorrect: z.coerce.boolean().default(false),
        position: z.coerce.number().int().min(0).default(0),
      }),
    )
    .default([]),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional().default(''),
  status: z.string().trim().optional().default(''),
  stageId: z.string().trim().optional().default(''),
  examId: z.string().trim().optional().default(''),
  // Dipakai listExams - default 'startAt' (perilaku lama, dipakai tabel
  // Jadwal & Ujian yang memang perlu urut kronologis tanggal ujian).
  // 'updatedAt' dipakai picker ujian di Bank Soal, supaya ujian yang baru
  // saja diedit muncul di paling atas.
  sortBy: z.enum(['startAt', 'createdAt', 'updatedAt']).optional().default('startAt'),
});

export const validate = (schema, data) => schema.parse(data);

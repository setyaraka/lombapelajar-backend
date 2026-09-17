import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding exam data...');

  // 1. Seed stages
  const stageNames = [
    { name: 'Penyisihan', position: 1, description: 'Tahap penyisihan kompetisi' },
    { name: 'Semifinal', position: 2, description: 'Tahap semifinal kompetisi' },
    { name: 'Final', position: 3, description: 'Tahap final perebutan juara' },
    { name: '16 Besar', position: 4, description: 'Tahap gugur 16 besar' },
    { name: 'Perempat Final', position: 5, description: 'Tahap perempat final' },
  ];

  const stages = [];
  for (const s of stageNames) {
    const stage = await prisma.examStage.upsert({
      where: { name: s.name },
      update: { position: s.position, description: s.description },
      create: s,
    });
    stages.push(stage);
  }
  console.log(`Seeded ${stages.length} exam stages.`);

  // 1.5 Dapatkan atau buat kompetisi
  let competition = await prisma.competition.findFirst();

  if (!competition) {
    competition = await prisma.competition.create({
      data: {
        title: 'Olimpiade Matematika Nasional',
        description:
          'Kompetisi matematika tingkat nasional untuk menguji kemampuan logika dan pemecahan masalah.',
        category: 'Sains',
        level: ['SMA', 'MA'],
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 hari lagi
        price: 50000,
        bankHolder: 'Panitia Lomba',
        bankName: 'Bank Mandiri',
        bankNumber: '1234567890',
        qris: 'qris-placeholder.png',
      },
    });
    console.log(`Created new competition: ${competition.title}`);
  } else {
    console.log(`Using existing competition: ${competition.title}`);
  }

  // 2. Buat atau perbarui Exam untuk kompetisi tersebut
  let exam = await prisma.exam.findFirst({
    where: { competitionId: competition.id },
  });

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  if (exam) {
    // Update agar jadwalnya aktif sekarang
    exam = await prisma.exam.update({
      where: { id: exam.id },
      data: {
        startAt: tenMinutesAgo,
        endAt: twoHoursLater,
        announcementAt: tomorrow,
        resultPublished: false,
        durationMinutes: 120, // default 2 jam
        stageId: stages[0].id,
      },
    });
    console.log(`Updated exam: ${exam.title} schedule to be active now.`);
  } else {
    exam = await prisma.exam.create({
      data: {
        competitionId: competition.id,
        stageId: stages[0].id,
        title: 'Ujian Penyisihan Matematika SMA',
        description: 'Ujian seleksi tahap penyisihan online.',
        startAt: tenMinutesAgo,
        endAt: twoHoursLater,
        durationMinutes: 120, // default 2 jam
        maxAttempts: 2,
        randomizeQuestions: true,
        randomizeOptions: true,
        announcementAt: tomorrow,
        resultPublished: false,
      },
    });
    console.log(`Created new exam: ${exam.title}`);
  }

  // 3. Pastikan ada soal ujian (hapus dulu yang lama agar bersih)
  await prisma.examQuestion.deleteMany({
    where: { examId: exam.id },
  });

  console.log('Cleared existing questions. Re-seeding...');

  // SOAL PILIHAN GANDA (1 s.d. 10)
  const mcQuestions = [
    {
      text: 'Siapakah penemu mesin analitik yang dianggap sebagai pelopor komputer modern?',
      type: 'SINGLE_CHOICE',
      points: 5,
      position: 1,
      options: [
        { text: 'Charles Babbage', isCorrect: true, position: 1 },
        { text: 'Alan Turing', isCorrect: false, position: 2 },
        { text: 'Ada Lovelace', isCorrect: false, position: 3 },
        { text: 'Steve Jobs', isCorrect: false, position: 4 },
      ],
    },
    {
      text: 'Protokol jaringan manakah yang digunakan untuk mengirim halaman web secara aman?',
      type: 'SINGLE_CHOICE',
      points: 5,
      position: 2,
      options: [
        { text: 'HTTP', isCorrect: false, position: 1 },
        { text: 'HTTPS', isCorrect: true, position: 2 },
        { text: 'FTP', isCorrect: false, position: 3 },
        { text: 'SMTP', isCorrect: false, position: 4 },
      ],
    },
    {
      text: 'Manakah di bawah ini yang merupakan unit terkecil dari penyimpanan data digital?',
      type: 'SINGLE_CHOICE',
      points: 5,
      position: 3,
      options: [
        { text: 'Byte', isCorrect: false, position: 1 },
        { text: 'Bit', isCorrect: true, position: 2 },
        { text: 'Kilobyte', isCorrect: false, position: 3 },
        { text: 'Megabyte', isCorrect: false, position: 4 },
      ],
    },
    {
      text: 'Bahasa pemrograman manakah yang dikenal sebagai standar untuk pengembangan kecerdasan buatan?',
      type: 'SINGLE_CHOICE',
      points: 5,
      position: 4,
      options: [
        { text: 'Python', isCorrect: true, position: 1 },
        { text: 'HTML', isCorrect: false, position: 2 },
        { text: 'CSS', isCorrect: false, position: 3 },
        { text: 'Assembly', isCorrect: false, position: 4 },
      ],
    },
    {
      text: 'Komponen komputer manakah yang berfungsi sebagai otak utama sistem untuk memproses data?',
      type: 'SINGLE_CHOICE',
      points: 5,
      position: 5,
      options: [
        { text: 'RAM', isCorrect: false, position: 1 },
        { text: 'GPU', isCorrect: false, position: 2 },
        { text: 'CPU', isCorrect: true, position: 3 },
        { text: 'HDD', isCorrect: false, position: 4 },
      ],
    },
    {
      text: 'Metode sorting manakah yang memiliki kompleksitas waktu rata-rata O(n log n)?',
      type: 'SINGLE_CHOICE',
      points: 5,
      position: 6,
      options: [
        { text: 'Bubble Sort', isCorrect: false, position: 1 },
        { text: 'Insertion Sort', isCorrect: false, position: 2 },
        { text: 'Quick Sort', isCorrect: true, position: 3 },
        { text: 'Selection Sort', isCorrect: false, position: 4 },
      ],
    },
    {
      text: 'Database SQL menyimpan data terstruktur dalam bentuk apa?',
      type: 'SINGLE_CHOICE',
      points: 5,
      position: 7,
      options: [
        { text: 'Dokumen JSON', isCorrect: false, position: 1 },
        { text: 'Tabel Baris & Kolom', isCorrect: true, position: 2 },
        { text: 'Grafik (Nodes & Edges)', isCorrect: false, position: 3 },
        { text: 'Key-Value Pair', isCorrect: false, position: 4 },
      ],
    },
    {
      text: 'Struktur data LIFO (Last In First Out) diwakili oleh tipe data?',
      type: 'SINGLE_CHOICE',
      points: 5,
      position: 8,
      options: [
        { text: 'Queue', isCorrect: false, position: 1 },
        { text: 'Stack', isCorrect: true, position: 2 },
        { text: 'Array', isCorrect: false, position: 3 },
        { text: 'Tree', isCorrect: false, position: 4 },
      ],
    },
    {
      text: 'Manakah yang merupakan sistem operasi open source yang paling populer untuk smartphone?',
      type: 'SINGLE_CHOICE',
      points: 5,
      position: 9,
      options: [
        { text: 'Linux', isCorrect: false, position: 1 },
        { text: 'Android', isCorrect: true, position: 2 },
        { text: 'Windows', isCorrect: false, position: 3 },
        { text: 'iOS', isCorrect: false, position: 4 },
      ],
    },
    {
      text: 'Protokol Transport Layer manakah yang menjamin pengiriman paket data yang andal (reliable)?',
      type: 'SINGLE_CHOICE',
      points: 5,
      position: 10,
      options: [
        { text: 'TCP', isCorrect: true, position: 1 },
        { text: 'UDP', isCorrect: false, position: 2 },
        { text: 'IP', isCorrect: false, position: 3 },
        { text: 'HTTP', isCorrect: false, position: 4 },
      ],
    },
  ];

  for (const q of mcQuestions) {
    await prisma.examQuestion.create({
      data: {
        examId: exam.id,
        text: q.text,
        type: q.type,
        points: q.points,
        position: q.position,
        options: {
          create: q.options,
        },
      },
    });
  }

  // SOAL ESSAY (11 s.d. 15)
  const essayQuestions = [
    {
      text: 'Jelaskan perbedaan antara RAM (Random Access Memory) dan Hard Disk Drive (HDD) dalam sebuah sistem komputer.',
      points: 10,
      position: 11,
    },
    {
      text: 'Apa yang dimaksud dengan Object-Oriented Programming (OOP) dan sebutkan 3 pilar utamanya.',
      points: 10,
      position: 12,
    },
    {
      text: 'Jelaskan fungsi dari DNS (Domain Name System) di dalam jaringan internet.',
      points: 10,
      position: 13,
    },
    {
      text: 'Mengapa penting bagi seorang developer untuk menggunakan Version Control System seperti Git?',
      points: 10,
      position: 14,
    },
    {
      text: 'Jelaskan perbedaan mendasar antara enkripsi simetris (symmetric encryption) dan enkripsi asimetris (asymmetric encryption).',
      points: 10,
      position: 15,
    },
  ];

  for (const q of essayQuestions) {
    await prisma.examQuestion.create({
      data: {
        examId: exam.id,
        text: q.text,
        type: 'ESSAY',
        points: q.points,
        position: q.position,
      },
    });
  }

  console.log('Successfully seeded 10 multiple choice questions and 5 essay questions.');

  // 4. Auto-approve all existing registrations so they can start testing immediately
  const registrations = await prisma.registration.findMany({
    where: { competitionId: competition.id },
  });

  for (const reg of registrations) {
    if (reg.status !== 'APPROVED') {
      await prisma.registration.update({
        where: { id: reg.id },
        data: { status: 'APPROVED' },
      });

      const proof = await prisma.paymentProof.findUnique({
        where: { registrationId: reg.id },
      });

      if (proof) {
        await prisma.paymentProof.update({
          where: { id: proof.id },
          data: { status: 'VERIFIED' },
        });
      } else {
        await prisma.paymentProof.create({
          data: {
            registrationId: reg.id,
            status: 'VERIFIED',
            fileKey: 'dummy-proof-key',
          },
        });
      }
    }
  }

  if (registrations.length > 0) {
    console.log(`Approved ${registrations.length} registrations to allow immediate exam access.`);
  }

  // 5. Reset attempts for user budi@mail.com so they can take the exam again
  const userBudi = await prisma.user.findUnique({ where: { email: 'budi@mail.com' } });
  if (userBudi) {
    // Ensure Budi is registered and approved for the competition
    let budiReg = await prisma.registration.findFirst({
      where: { userId: userBudi.id, competitionId: competition.id },
    });
    if (!budiReg) {
      budiReg = await prisma.registration.create({
        data: {
          userId: userBudi.id,
          competitionId: competition.id,
          leaderName: userBudi.name,
          members: [],
          parentName: 'Orang Tua Budi',
          status: 'APPROVED',
        },
      });
      console.log('Created approved registration for Budi.');
    } else if (budiReg.status !== 'APPROVED') {
      await prisma.registration.update({
        where: { id: budiReg.id },
        data: { status: 'APPROVED' },
      });
      console.log('Approved existing registration for Budi.');
    }

    // Ensure payment proof exists and is verified
    const proof = await prisma.paymentProof.findUnique({
      where: { registrationId: budiReg.id },
    });
    if (!proof) {
      await prisma.paymentProof.create({
        data: {
          registrationId: budiReg.id,
          status: 'VERIFIED',
          fileKey: 'dummy-proof-key',
        },
      });
    } else if (proof.status !== 'VERIFIED') {
      await prisma.paymentProof.update({
        where: { id: proof.id },
        data: { status: 'VERIFIED' },
      });
    }

    // Delete all answers, logs and attempts
    const attempts = await prisma.examAttempt.findMany({
      where: { userId: userBudi.id, examId: exam.id },
      select: { id: true },
    });

    const attemptIds = attempts.map((a) => a.id);

    await prisma.examAnswer.deleteMany({
      where: { attemptId: { in: attemptIds } },
    });
    await prisma.examActivityLog.deleteMany({
      where: { attemptId: { in: attemptIds } },
    });
    await prisma.examAttempt.deleteMany({
      where: { userId: userBudi.id, examId: exam.id },
    });
    console.log("Reset Budi's attempts, answers, and logs for this exam.");
  }

  console.log('Seeding complete! Ready for manual testing.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

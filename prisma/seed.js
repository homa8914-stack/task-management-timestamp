const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const facilities = [
  // 施設名をここに追加してください（GASの施設マスタからコピー）
  // "ひまわりケアセンター",
  // "さくら訪問 nursing home",
];

async function main() {
  for (const name of facilities) {
    await prisma.facility.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }
  console.log(`Seeded ${facilities.length} facilities.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

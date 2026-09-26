import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  { name: "Food", icon: "utensils", color: "#F97316" },
  { name: "Bills", icon: "receipt", color: "#EF4444" },
  { name: "Sporting goods", icon: "dumbbell", color: "#22C55E" },
  { name: "Home goods", icon: "home", color: "#3B82F6" },
  { name: "Clothing", icon: "shirt", color: "#A855F7" },
  { name: "Other", icon: "tag", color: "#6B7280" },
];

async function main() {
  for (const category of DEFAULT_CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { name: category.name, userId: null, isDefault: true },
    });

    if (existing) {
      console.log(`Skipping "${category.name}" — already seeded.`);
      continue;
    }

    await prisma.category.create({
      data: {
        ...category,
        userId: null,
        isDefault: true,
      },
    });
    console.log(`Seeded default category "${category.name}".`);
  }
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

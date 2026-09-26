import prisma from "../config/db.js";

export async function findAllForUser(userId) {
  return prisma.category.findMany({
    where: {
      OR: [{ userId: null }, { userId }],
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function findById(id) {
  return prisma.category.findUnique({
    where: { id },
  });
}

export async function create(userId, data) {
  return prisma.category.create({
    data: {
      ...data,
      userId,
      isDefault: false,
    },
  });
}

export async function update(id, data) {
  return prisma.category.update({
    where: { id },
    data,
  });
}

export async function deleteCategory(id) {
  return prisma.category.delete({
    where: { id },
  });
}

export async function isOwnedByUser(id, userId) {
  const category = await prisma.category.findUnique({
    where: { id },
    select: { userId: true, isDefault: true },
  });

  if (!category || category.isDefault) return false;
  return category.userId === userId;
}

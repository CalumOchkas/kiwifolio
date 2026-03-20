"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createPortfolio(formData: FormData) {
  const name = formData.get("name") as string;
  if (!name?.trim()) throw new Error("Portfolio name is required");

  await prisma.portfolio.create({ data: { name: name.trim() } });
  revalidatePath("/");
}

export async function updatePortfolio(id: string, formData: FormData) {
  const name = formData.get("name") as string;
  if (!name?.trim()) throw new Error("Portfolio name is required");

  await prisma.portfolio.update({ where: { id }, data: { name: name.trim() } });
  revalidatePath("/");
}

export async function renamePortfolio(id: string, name: string) {
  if (!name?.trim()) throw new Error("Portfolio name is required");
  await prisma.portfolio.update({ where: { id }, data: { name: name.trim() } });
  revalidatePath("/");
  revalidatePath(`/holdings/${id}`);
}

export async function deletePortfolio(id: string) {
  await prisma.portfolio.delete({ where: { id } });
  revalidatePath("/");
}

export async function getPortfolios() {
  return prisma.portfolio.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

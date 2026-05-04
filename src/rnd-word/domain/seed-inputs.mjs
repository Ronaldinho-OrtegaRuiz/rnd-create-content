import { randomUUID } from "node:crypto";

export const seedInputs = [];

export function createSeedInput({ word, context, categoryId }) {
  const item = {
    id: randomUUID(),
    word,
    context,
    category_id: categoryId,
    status: "pending",
  };
  seedInputs.push(item);
  return item;
}

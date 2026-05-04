import { randomUUID } from "node:crypto";

export const contents = [];

export function createContent({ word, categoryId, description, extra, highlights }) {
  const item = {
    id: randomUUID(),
    word,
    category_id: categoryId,
    description,
    extra,
    highlights,
    status: "draft",
    created_at: new Date().toISOString(),
  };
  contents.push(item);
  return item;
}

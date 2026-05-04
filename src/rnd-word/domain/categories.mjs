/** Colores alineados con variantes hook (generate / tarjetas). */
export const categories = [
  { id: "tech", name: "Tech", color: "#39ff14" },
  { id: "psychology", name: "Psychology", color: "#9333ea" },
  { id: "money", name: "Money", color: "#00b8ff" },
  { id: "culture", name: "Culture", color: "#ff6b00" },
  { id: "love", name: "Love", color: "#ef4444" },
];

export const categoryIds = new Set(categories.map((c) => c.id));

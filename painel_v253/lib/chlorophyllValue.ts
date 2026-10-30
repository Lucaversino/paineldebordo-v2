/** Preserva ausência de dados; zero só é válido quando informado pelo modelo. */
export function chlorophyllValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1000 ? number : null;
}

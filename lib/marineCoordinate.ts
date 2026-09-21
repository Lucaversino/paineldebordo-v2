/** Padrão visual do Painel de Bordo: DD°MMMM (ex.: 25°4719 / 48°0296). */
export function coordinateDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

export function formatCoordinateInput(value: unknown) {
  const digits = coordinateDigits(value);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}°${digits.slice(2)}`;
}

export function decimalToCoordinateInput(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  const absolute = Math.abs(Number(value));
  const degrees = Math.floor(absolute);
  // centésimos de minuto, sempre 4 algarismos depois dos graus
  let minuteHundredths = Math.round((absolute - degrees) * 60 * 100);
  let safeDegrees = degrees;
  if (minuteHundredths >= 6000) {
    safeDegrees += 1;
    minuteHundredths = 0;
  }
  return formatCoordinateInput(`${String(safeDegrees).padStart(2, "0")}${String(minuteHundredths).padStart(4, "0")}`);
}

export function coordinateInputToDecimal(value: unknown, negative = true) {
  const digits = coordinateDigits(value);
  if (digits.length !== 6) return null;
  const degrees = Number(digits.slice(0, 2));
  const minutes = Number(`${digits.slice(2, 4)}.${digits.slice(4)}`);
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || minutes >= 60) return null;
  const decimal = degrees + minutes / 60;
  return negative ? -decimal : decimal;
}

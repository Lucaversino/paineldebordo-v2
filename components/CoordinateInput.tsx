"use client";

import { useState } from "react";

function decimalToDigits(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  const absolute = Math.abs(Number(value));
  const degrees = Math.floor(absolute);
  const minutes = ((absolute - degrees) * 60).toFixed(2).replace(".", "");
  return `${String(degrees).padStart(2, "0")}${minutes}`;
}

export default function CoordinateInput({ name, direction, defaultDecimal }: {
  name: string;
  direction: "S" | "W";
  defaultDecimal?: number | null;
}) {
  const [digits, setDigits] = useState(() => decimalToDigits(defaultDecimal));

  return <span className="coord-free-input">
    <input
      name={name}
      required
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={6}
      autoComplete="off"
      value={digits}
      placeholder={direction === "S" ? "254530" : "462550"}
      onChange={(event) => setDigits(event.target.value.replace(/\D/g, "").slice(0, 6))}
    />
    <span className="coord-degree" aria-hidden="true">°</span>
  </span>;
}

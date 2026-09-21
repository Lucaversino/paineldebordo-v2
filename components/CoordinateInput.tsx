"use client";

import { useState } from "react";
import { decimalToCoordinateInput, formatCoordinateInput } from "../lib/marineCoordinate";

export default function CoordinateInput({ name, direction, defaultDecimal }: {
  name: string;
  direction: "S" | "W";
  defaultDecimal?: number | null;
}) {
  const [value, setValue] = useState(() => decimalToCoordinateInput(defaultDecimal));

  return <span className="coord-free-input">
    <input
      name={name}
      required
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      placeholder={direction === "S" ? "25°4530" : "46°2550"}
      onChange={(event) => setValue(formatCoordinateInput(event.target.value))}
      aria-label={`Coordenada ${direction}`}
    />
  </span>;
}

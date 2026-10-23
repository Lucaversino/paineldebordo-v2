/** Only provider classification identifies fishing boats; names are not evidence. */
export function isAutomaticFishingVessel(vessel: { vesselType?: string; navStatusText?: string }) {
  const type = String(vessel.vesselType || "").toLowerCase();
  const status = String(vessel.navStatusText || "").toLowerCase().trim();
  return /fishing|pesca|pesqueir/.test(type) || /(^|\D)30(\D|$)/.test(type)
    || status === "7" || /em pesca|engaged in fishing|fishing/.test(status);
}

export function validAutomaticPosition(vessel: { mmsi?: string; lat?: number; lon?: number }) {
  return Boolean(vessel && /^\d{9}$/.test(String(vessel.mmsi || ""))
    && typeof vessel.lat === "number" && Number.isFinite(vessel.lat) && Math.abs(vessel.lat) <= 90
    && typeof vessel.lon === "number" && Number.isFinite(vessel.lon) && Math.abs(vessel.lon) <= 180);
}

export function automaticPositionIsOld(vessel: { positionReceived?: string }, now = Date.now()) {
  const stamp = Date.parse(vessel.positionReceived || "");
  return !Number.isFinite(stamp) || now - stamp > 45 * 60000 || stamp > now + 60000;
}

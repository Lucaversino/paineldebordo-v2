/** Monta datas locais da largada, incluindo encerramento no dia seguinte. */
export function fishingSetDateTimes(fishingDate: string, startTime: string, endTime: string, endNextDay: boolean) {
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(fishingDate || "");
  const validTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || "");
  if (!validDate || !validTime(startTime) || !validTime(endTime)) return null;
  const startDay = new Date(`${fishingDate}T12:00:00`);
  if (Number.isNaN(startDay.getTime()) || startDay.getFullYear() !== +fishingDate.slice(0,4) || startDay.getMonth() + 1 !== +fishingDate.slice(5,7) || startDay.getDate() !== +fishingDate.slice(8,10)) return null;
  const endDay = new Date(startDay);
  if (endNextDay) endDay.setDate(endDay.getDate() + 1);
  const finalDate = `${endDay.getFullYear()}-${String(endDay.getMonth()+1).padStart(2,"0")}-${String(endDay.getDate()).padStart(2,"0")}`;
  const startedAt = `${fishingDate}T${startTime}:00`;
  const finishedAt = `${finalDate}T${endTime}:00`;
  if (new Date(finishedAt).getTime() <= new Date(startedAt).getTime()) return null;
  return { startedAt, finishedAt };
}

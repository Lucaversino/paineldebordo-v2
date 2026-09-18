"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function DashboardProductionChart({ data }: { data: any[] }) {
  if (!data?.length) return <div className="chartempty">O gráfico aparecerá depois da primeira captura.</div>;
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="productionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
        <XAxis dataKey="day" />
        <YAxis />
        <Tooltip formatter={(value: number) => [`${Math.round(Number(value || 0))} kg`, ""]} />
        <Area type="monotone" dataKey="kg" stroke="currentColor" fill="url(#productionFill)" strokeWidth={3} />
        <Area type="monotone" dataKey="meta" stroke="currentColor" fill="none" strokeDasharray="6 5" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

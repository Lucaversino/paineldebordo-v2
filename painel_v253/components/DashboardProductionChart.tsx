"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const fmtKg = (value: unknown) =>
  `${Math.round(Number(value || 0)).toLocaleString("pt-BR")} kg`;

const fmtDay = (value: unknown) => {
  const raw = String(value || "");
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}` : raw;
};

function PerformanceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload || {};
  const captured = Number(row.kg || 0);
  const target = Number(row.meta || 0);
  const difference = captured - target;
  const pace = target > 0 ? (captured / target) * 100 : 0;

  return (
    <div
      className="production-tooltip"
      style={{
        minWidth: 220,
        padding: "12px 14px",
        border: "1px solid #37616a",
        borderRadius: 10,
        background: "#071f25",
        color: "#ffffff",
        boxShadow: "0 12px 35px rgba(0,0,0,.5)",
        fontSize: 12,
      }}
    >
      <strong style={{ display: "block", marginBottom: 8, color: "#ffffff", fontSize: 14 }}>{fmtDay(label)}</strong>
      <div style={{ color: "#dff4f1" }}><span className="production-dot captured" />Capturado <b style={{ color: "#ffffff" }}>{fmtKg(captured)}</b></div>
      <div style={{ color: "#dff4f1" }}><span className="production-dot target" />Meta esperada <b style={{ color: "#ffffff" }}>{fmtKg(target)}</b></div>
      <div className={difference >= 0 ? "positive" : "negative"} style={{ color: "#dff4f1" }}>
        Diferença <b>{difference >= 0 ? "+" : ""}{fmtKg(difference)}</b>
      </div>
      <small style={{ color: "#9bc0c6" }}>Ritmo da meta: {Math.round(pace)}%</small>
    </div>
  );
}

export default function DashboardProductionChart({ data }: { data: any[] }) {
  if (!data?.length) {
    return <div className="chartempty">O gráfico aparecerá depois da primeira captura.</div>;
  }

  const last = data[data.length - 1] || {};
  const captured = Number(last.kg || 0);
  const expected = Number(last.meta || 0);
  const difference = captured - expected;
  const pace = expected > 0 ? (captured / expected) * 100 : 0;

  return (
    <div className="production-chart-wrap">
      <div className="production-chart-summary" aria-label="Resumo do desempenho">
        <div>
          <small>CAPTURADO</small>
          <b>{fmtKg(captured)}</b>
        </div>
        <div>
          <small>META ATÉ AGORA</small>
          <b>{fmtKg(expected)}</b>
        </div>
        <div className={difference >= 0 ? "positive" : "negative"}>
          <small>DIFERENÇA</small>
          <b>{difference >= 0 ? "+" : ""}{fmtKg(difference)}</b>
        </div>
        <div>
          <small>RITMO DA META</small>
          <b>{Math.round(pace)}%</b>
        </div>
      </div>

      <div className="production-chart-legend" aria-hidden="true">
        <span><i className="captured" />Produção acumulada</span>
        <span><i className="target" />Meta esperada</span>
      </div>

      <div className="production-chart-canvas">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 12, right: 22, left: 8, bottom: 8 }}>
            <defs>
              <linearGradient id="productionCapturedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2de0b0" stopOpacity={0.34} />
                <stop offset="100%" stopColor="#2de0b0" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#31525a" strokeDasharray="4 5" opacity={0.55} vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={fmtDay}
              tick={{ fill: "#9ab6bc", fontSize: 12, fontWeight: 700 }}
              tickLine={false}
              axisLine={{ stroke: "#31525a" }}
              minTickGap={18}
            />
            <YAxis
              tickFormatter={(value) => Math.round(Number(value || 0)).toLocaleString("pt-BR")}
              tick={{ fill: "#9ab6bc", fontSize: 12, fontWeight: 700 }}
              tickLine={false}
              axisLine={false}
              width={62}
              allowDecimals={false}
              domain={[0, "auto"]}
            />
            <Tooltip
              content={<PerformanceTooltip />}
              contentStyle={{
                backgroundColor: "#071f25",
                border: "1px solid #37616a",
                borderRadius: 10,
                color: "#ffffff",
                boxShadow: "0 12px 35px rgba(0,0,0,.5)",
              }}
              labelStyle={{ color: "#ffffff", fontWeight: 800 }}
              itemStyle={{ color: "#ffffff" }}
              cursor={{ stroke: "#d8efeb", strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.65 }}
              wrapperStyle={{ outline: "none", zIndex: 50 }}
            />
            <Area
              type="monotone"
              dataKey="kg"
              name="Produção acumulada"
              stroke="#2de0b0"
              fill="url(#productionCapturedFill)"
              strokeWidth={4}
              activeDot={{ r: 6, fill: "#2de0b0", stroke: "#062127", strokeWidth: 3 }}
              dot={{ r: 3.5, fill: "#2de0b0", stroke: "#062127", strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="meta"
              name="Meta esperada"
              stroke="#f4c76a"
              fill="none"
              strokeWidth={2.5}
              strokeDasharray="8 6"
              activeDot={{ r: 5, fill: "#f4c76a", stroke: "#062127", strokeWidth: 2 }}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

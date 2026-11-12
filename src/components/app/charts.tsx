"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDate, humanise } from "@/lib/utils";

/**
 * Charts.
 *
 * Colours come from the validated chart tokens in globals.css rather than from
 * component literals, so light and dark modes stay consistent and the palette
 * can be re-validated in one place. Series identity is never carried by colour
 * alone: a legend is always present and lines carry visible end labels.
 */

const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

function TooltipCard({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  labelFormatter?: (value: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-raised">
      <p className="mb-1 text-xs font-medium text-foreground">
        {labelFormatter && label !== undefined ? labelFormatter(label) : label}
      </p>
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type TrendDatum = {
  period: string;
  created: number;
  acknowledged: number;
  completed: number;
};

export function ReferralTrendChart({ data }: { data: TrendDatum[] }) {
  const series = [
    { key: "created", label: "Created", color: SERIES[0] },
    { key: "acknowledged", label: "Acknowledged", color: SERIES[1] },
    { key: "completed", label: "Completed", color: SERIES[2] },
  ] as const;

  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No referrals were created in this period.
      </p>
    );
  }

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4">
        {series.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            {item.label}
          </li>
        ))}
      </ul>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tickFormatter={(value: string) => formatDate(value).slice(0, 6)}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={44}
            />
            <Tooltip
              content={<TooltipCard labelFormatter={(value) => `Week of ${formatDate(String(value))}`} />}
              cursor={{ stroke: "var(--chart-grid)", strokeWidth: 1 }}
            />
            {series.map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: item.color }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--card))" }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Show as a table
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Week of</th>
              <th className="py-1.5 pr-3 font-medium">Created</th>
              <th className="py-1.5 pr-3 font-medium">Acknowledged</th>
              <th className="py-1.5 font-medium">Completed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.period} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-3">{formatDate(row.period)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{row.created}</td>
                <td className="py-1.5 pr-3 tabular-nums">{row.acknowledged}</td>
                <td className="py-1.5 tabular-nums">{row.completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export type CategoryDatum = { label: string; value: number };

/**
 * Horizontal bar chart for a single measure across categories. One hue, because
 * the bars are one series: colour here carries magnitude, not identity.
 */
export function CategoryBarChart({
  data,
  valueLabel,
  emptyMessage,
}: {
  data: CategoryDatum[];
  valueLabel: string;
  emptyMessage: string;
}) {
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const height = Math.max(180, data.length * 38 + 24);

  return (
    <div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
            barCategoryGap={8}
          >
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              tickLine={false}
              axisLine={false}
              width={168}
            />
            <Tooltip
              content={<TooltipCard />}
              cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.35 }}
            />
            <Bar dataKey="value" name={valueLabel} radius={[0, 4, 4, 0]} maxBarSize={18}>
              {data.map((entry) => (
                <Cell key={entry.label} fill="var(--chart-sequential)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Show as a table
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Category</th>
              <th className="py-1.5 font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.label} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-3">{row.label}</td>
                <td className="py-1.5 tabular-nums">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function statusLabel(value: string): string {
  return humanise(value);
}

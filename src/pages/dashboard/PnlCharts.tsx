import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BRANCHES, BRANCH_MAP } from '../../app/store/branches';
import { pnlFor } from '../../app/store/selectors';
import type { AppState, BranchFilter } from '../../app/store/types';
import { lastMonths, monthLabel, monthLabelShort } from '../../shared/lib/dates';
import { money } from '../../shared/lib/format';
import { Card, SectionTitle } from '../../shared/ui';

const CHART_COLORS = {
  revenue: '#0F172A',
  expense: '#B45309',
  profit: '#1E293B',
  donut: ['#B45309', '#D97706', '#475569', '#92400E', '#94A3B8', '#334155'],
};

const AXIS_TICK = { fontSize: 15, fill: '#475569' };

const TOOLTIP_STYLE = {
  fontSize: 16,
  borderRadius: 14,
  borderColor: '#DFE6EF',
  boxShadow: '0 10px 30px -14px rgb(15 23 42 / 0.30)',
  background: 'rgb(255 255 255 / 0.96)',
};

/**
 * The dashboard's three charts. Deliberately a separate lazy chunk: recharts is
 * heavy, and keeping it out of the entry bundle lets the app paint instantly.
 */
export function PnlCharts({
  state,
  branch,
  month,
}: {
  state: AppState;
  branch: BranchFilter;
  month: string;
}) {
  const pnl = useMemo(() => pnlFor(state, branch, month), [state, branch, month]);

  // 1. Revenue vs expenses by branch (the selected month, all PGs side by side)
  const branchBars = useMemo(
    () =>
      BRANCHES.map((b) => {
        const p = pnlFor(state, b.id, month);
        return { name: b.id, Revenue: p.revenue, Expenses: p.expenses.total };
      }),
    [state, month],
  );

  // 2. Expense breakdown by category
  const donutData = useMemo(() => {
    const e = pnl.expenses.byCategory;
    const grouped = [
      { name: 'Owner Lease', value: e['Owner Lease'] },
      { name: 'EB Electricity', value: e['EB Electricity'] },
      { name: 'Water (cans + tankers)', value: e['Water Cans'] + e['Water Tankers'] },
      { name: 'Staff Salary', value: e['Staff Salary'] },
      { name: 'Wi-Fi', value: e['Wi-Fi Recharges'] },
      { name: 'Catering & Provisions', value: e.Catering + e['Daily Provisions'] },
    ].filter((g) => g.value > 0);
    return grouped;
  }, [pnl]);

  // 3. Six-month net profit trend
  const trend = useMemo(() => {
    return lastMonths(month, 6).map((k) => ({
      name: monthLabelShort(k),
      'Net Profit / Loss': pnlFor(state, branch, k).net,
    }));
  }, [state, branch, month]);

  const hasAnyExpense = donutData.length > 0;
  const trendHasData = trend.some((t) => t['Net Profit / Loss'] !== 0);
  const branchLabel = branch === 'ALL' ? 'all PGs combined' : BRANCH_MAP[branch].short;

  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <Card>
        <SectionTitle>Revenue vs Expenses — by PG Branch</SectionTitle>
        <p className="mb-2 text-base text-slate-600">
          Money received compared with money spent in {monthLabel(month)} for each PG.
        </p>
        {branchBars.every((b) => b.Revenue === 0 && b.Expenses === 0) ? (
          <p className="py-16 text-center text-base text-slate-600">
            No money recorded in {monthLabel(month)} yet.
          </p>
        ) : (
          <div role="img" aria-label={`Bar chart: revenue and expenses per branch in ${monthLabel(month)}. Revenue total ${money(pnl.revenue)}, expenses total ${money(pnl.expenses.total)}.`}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={branchBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DFE6EF" vertical={false} />
                <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#C3CDDB' }} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                <Tooltip formatter={(v: number) => money(v)} contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 16 }} />
                <Bar dataKey="Revenue" fill={CHART_COLORS.revenue} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Expenses" fill={CHART_COLORS.expense} radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Where the Money Went — Expense Breakdown</SectionTitle>
        <p className="mb-2 text-base text-slate-600">
          Each slice of the {money(pnl.expenses.total)} spent in {monthLabel(month)}.
        </p>
        {!hasAnyExpense ? (
          <p className="py-16 text-center text-base text-slate-600">No expenses recorded in this month.</p>
        ) : (
          <div role="img" aria-label={`Donut chart of expenses in ${monthLabel(month)}: ${donutData.map((d) => `${d.name} ${money(d.value)}`).join(', ')}.`}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={115}
                  paddingAngle={2}
                  stroke="#FFFFFF"
                  isAnimationActive={false}
                >
                  {donutData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS.donut[i % CHART_COLORS.donut.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => money(v)} contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 15 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="xl:col-span-2">
        <SectionTitle>Net Profit Trend — Last 6 Months</SectionTitle>
        <p className="mb-2 text-base text-slate-600">
          Profit or loss each month for {branchLabel}.
        </p>
        {!trendHasData ? (
          <p className="py-16 text-center text-base text-slate-600">Not enough recorded data yet to show a trend.</p>
        ) : (
          <div role="img" aria-label={`Line chart of net profit for the last 6 months: ${trend.map((t) => `${t.name} ${money(t['Net Profit / Loss'])}`).join(', ')}.`}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DFE6EF" vertical={false} />
                <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#C3CDDB' }} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                <Tooltip formatter={(v: number) => money(v)} contentStyle={TOOLTIP_STYLE} />
                <Line
                  type="monotone"
                  dataKey="Net Profit / Loss"
                  stroke={CHART_COLORS.profit}
                  strokeWidth={4}
                  dot={{ r: 5, fill: CHART_COLORS.profit }}
                  activeDot={{ r: 7 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}

export default PnlCharts;

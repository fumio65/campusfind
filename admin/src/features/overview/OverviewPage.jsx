import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Users,
  FileText,
  CheckCircle2,
  TrendingUp,
  MapPin,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import StatusPill from "../../shared/components/StatusPill";
import { staggerContainer, staggerItem } from "../../shared/lib/motion";
import { supabase } from "../../shared/lib/supabaseClient";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

function StatCard({ label, value, sub, tone, icon: Icon }) {
  const toneClass =
    {
      brand: "text-brand-600",
      open: "text-status-open-text",
      claimed: "text-status-claimed-text",
      muted: "text-text-secondary",
    }[tone] ?? "text-text-primary";

  return (
    <motion.div
      className="bg-surface-card border border-border rounded-xl p-5 flex items-center justify-between"
      {...staggerItem}
    >
      <div>
        <div className="text-xs text-text-secondary mb-1">{label}</div>
        <div className={`text-3xl font-bold ${toneClass}`}>{value}</div>
        {sub && <div className="text-xs text-text-muted mt-1">{sub}</div>}
      </div>
      <div className="w-10 h-10 rounded-full bg-surface-muted flex items-center justify-center text-text-secondary shrink-0">
        <Icon size={18} aria-hidden="true" />
      </div>
    </motion.div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [dropOffReports, setDropOffReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function fetchAll() {
    Promise.all([
      fetch(`${SERVER_URL}/overview`).then((r) => r.json()),
      fetch(`${SERVER_URL}/analytics`).then((r) => r.json()),
      fetch(`${SERVER_URL}/reports?status=approved`).then((r) => r.json()),
    ])
      .then(([overviewBody, analyticsBody, reportsBody]) => {
        if (overviewBody.error) throw new Error(overviewBody.error);
        setData(overviewBody);
        setAnalytics(analyticsBody);
        const pending = (reportsBody.reports ?? []).filter(
          (r) => r.active_claim?.drop_off_chosen,
        );
        setDropOffReports(pending);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel("admin-overview")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reports" },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        () => fetchAll(),
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-text-primary mb-4">Overview</h2>

      {loading && (
        <div className="text-sm text-text-muted py-8 text-center">
          Loading...
        </div>
      )}

      {error && (
        <div className="bg-status-rejected-bg text-status-rejected-text text-xs rounded-md px-3 py-2 mb-4">
          Could not load overview data: {error}
        </div>
      )}

      {data && (
        <>
          <motion.div
            className="grid grid-cols-4 gap-4 mb-5"
            {...staggerContainer}
          >
            <StatCard
              label="Total accounts"
              value={data.totalAccounts}
              sub={`${data.activeAccounts} active`}
              tone="brand"
              icon={Users}
            />
            <StatCard
              label="Items reported"
              value={data.totalReports}
              sub={`${data.openReports} open`}
              tone="open"
              icon={FileText}
            />
            <StatCard
              label="Resolved"
              value={data.resolvedReports}
              sub={
                data.totalReports > 0
                  ? `${Math.round((data.resolvedReports / data.totalReports) * 100)}% of total`
                  : "No reports yet"
              }
              tone="muted"
              icon={CheckCircle2}
            />
            <StatCard
              label="Claim approval rate"
              value={`${data.claimApprovalRate}%`}
              sub={`${data.totalClaims} claim${data.totalClaims === 1 ? "" : "s"} total`}
              tone="claimed"
              icon={TrendingUp}
            />
          </motion.div>

          {data.openReports > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="bg-status-claimed-bg border border-status-claimed-text/30 rounded-xl p-4 mb-5 flex gap-3 items-start"
            >
              <div className="w-7 h-7 rounded-full bg-status-claimed-text/10 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle
                  size={14}
                  className="text-status-claimed-text"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-status-claimed-text mb-0.5">
                  {data.openReports} open report
                  {data.openReports > 1 ? "s" : ""} awaiting a claim
                </div>
                <p className="text-xs text-status-claimed-text/80">
                  Students are waiting for someone to claim their lost items.
                </p>
              </div>
              <Link
                to="/reports"
                className="shrink-0 px-3 py-1.5 rounded-lg bg-status-claimed-text text-white text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                View reports
              </Link>
            </motion.div>
          )}

          {dropOffReports.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="border border-status-claimed-text/30 rounded-xl p-4 mb-5 bg-status-claimed-bg"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-full bg-status-claimed-text/10 flex items-center justify-center shrink-0">
                  <MapPin
                    size={14}
                    className="text-status-claimed-text"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-sm font-semibold text-status-claimed-text">
                  {dropOffReports.length} ISSC drop-off
                  {dropOffReports.length > 1 ? "s" : ""} pending action
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {dropOffReports.map((r) => (
                  <div
                    key={r.id}
                    className="bg-surface-card rounded-lg px-3 py-3 flex items-center justify-between gap-3 border border-border"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {r.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-text-muted">Finder:</span>
                        <span className="text-xs font-medium text-text-secondary">
                          {r.active_claim?.claimant_name}
                        </span>
                        {r.active_claim?.claimant_student_id && (
                          <span className="text-xs text-text-muted">
                            ({r.active_claim.claimant_student_id})
                          </span>
                        )}
                        <span className="text-text-muted text-xs">·</span>
                        <span className="text-xs text-text-muted">Owner:</span>
                        <span className="text-xs font-medium text-text-secondary">
                          {r.reporter_name}
                        </span>
                      </div>
                    </div>
                    <Link
                      to="/reports"
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
                    >
                      Go to Reports
                    </Link>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-status-claimed-text/70 mt-2.5">
                Verify the finder's ID and hand over the item at the ISSC
                office, then mark as handed over in Reports.
              </p>
            </motion.div>
          )}

          {analytics && analytics.itemsReported > 0 && (
            <div className="bg-surface-card border border-border rounded-xl p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-text-primary">
                  Reports over time
                </div>
                <Link
                  to="/analytics"
                  className="text-xs text-brand-600 hover:underline"
                >
                  Full analytics →
                </Link>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={analytics.reportsOverTime}>
                  <CartesianGrid stroke="#E2E8E6" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#06433C"
                    strokeWidth={2}
                    dot={false}
                    name="Reports filed"
                    isAnimationActive
                    animationDuration={500}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-semibold text-text-primary mb-2">
                Recent accounts
              </div>
              {data.recentAccounts.length === 0 ? (
                <div className="bg-surface-card border border-border rounded-xl py-10 text-center">
                  <p className="text-xs text-text-muted">
                    No accounts yet. Run a bulk import to get started.
                  </p>
                </div>
              ) : (
                <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
                  {data.recentAccounts.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0"
                    >
                      <div>
                        <div className="text-sm font-medium">
                          {a.first_name} {a.last_name}
                        </div>
                        <div className="text-xs text-text-muted">
                          {a.student_id}
                        </div>
                      </div>
                      <StatusPill status={a.status} />
                    </div>
                  ))}
                  <div className="px-4 py-2 border-t border-border">
                    <Link
                      to="/accounts"
                      className="text-xs text-brand-600 font-medium hover:underline"
                    >
                      View all {data.totalAccounts} accounts →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="text-sm font-semibold text-text-primary mb-2">
                Quick links
              </div>
              <div className="flex flex-col gap-2">
                <Link
                  to="/bulk-import"
                  className="bg-surface-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-border-strong transition-colors"
                >
                  <Users
                    size={16}
                    className="text-brand-600 shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <div className="text-sm font-semibold">Bulk import</div>
                    <div className="text-xs text-text-secondary">
                      Upload the Registrar CSV for the new term.
                    </div>
                  </div>
                </Link>
                <Link
                  to="/reports"
                  className="bg-surface-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-border-strong transition-colors"
                >
                  <FileText
                    size={16}
                    className="text-brand-600 shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <div className="text-sm font-semibold">Reports</div>
                    <div className="text-xs text-text-secondary">
                      Monitor and manage all lost item reports.
                    </div>
                  </div>
                </Link>
                <Link
                  to="/analytics"
                  className="bg-surface-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-border-strong transition-colors"
                >
                  <TrendingUp
                    size={16}
                    className="text-brand-600 shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <div className="text-sm font-semibold">Analytics</div>
                    <div className="text-xs text-text-secondary">
                      Trends, claim rates, and trust distribution.
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

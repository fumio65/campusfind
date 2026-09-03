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
  ArrowUpRight,
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
import { adminFetch, SERVER_URL } from "../../shared/lib/apiClient";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(firstName, lastName) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

function claimantName(claim) {
  if (claim?.claimant?.first_name) {
    return `${claim.claimant.first_name} ${claim.claimant.last_name}`;
  }
  return claim?.claimant_name ?? "—";
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [dropOffReports, setDropOffReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function fetchAll() {
    Promise.all([
      adminFetch(`/overview`).then((r) => r.json()),
      adminFetch(`/analytics`).then((r) => r.json()),
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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary leading-tight">
            Overview
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            NwSSU Lost &amp; Found · ISSC Admin
          </p>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 text-xs text-text-secondary bg-surface-muted border border-border rounded-lg px-2.5 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-status-open-text shrink-0" />
          Live
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-sm text-text-muted py-8 text-center">
          Loading...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-status-rejected-bg text-status-rejected-text text-xs rounded-md px-3 py-2 mb-4">
          Could not load overview data: {error}
        </div>
      )}

      {data && (
        <>
          {/* ── Stat cards ─────────────────────────────────────────────────── */}
          <motion.div
            className="grid grid-cols-4 gap-2.5 mb-5"
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

          {/* ── Open reports alert ─────────────────────────────────────────── */}
          {data.openReports > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="bg-status-claimed-bg border border-status-claimed-text/30 rounded-xl p-3.5 mb-5 flex gap-3 items-center"
            >
              <div className="w-7 h-7 rounded-full bg-status-claimed-text/10 flex items-center justify-center shrink-0">
                <AlertTriangle
                  size={14}
                  className="text-status-claimed-text"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-status-claimed-text">
                  {data.openReports} open report
                  {data.openReports > 1 ? "s" : ""} with no active claim
                </div>
                <p className="text-xs text-status-claimed-text/80">
                  Students are waiting — share these to social media to boost
                  visibility.
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

          {/* ── Lower grid: left col (chart + recent accounts), right rail (drop-offs) ── */}
          <div className="grid gap-3 items-start" style={{ gridTemplateColumns: "1fr 272px" }}>

            {/* LEFT — chart (conditional) + recent accounts below */}
            <div className="flex flex-col gap-3">

              {/* Chart — only when data exists */}
              {analytics && analytics.itemsReported > 0 && (
                <div className="bg-surface-card border border-border rounded-xl p-4">
                  <div className="flex items-baseline justify-between mb-4">
                    <div className="text-sm font-semibold text-text-primary">
                      Reports filed over time
                    </div>
                    <Link
                      to="/analytics"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 border border-brand-600/30 rounded-lg px-2.5 py-1 hover:bg-brand-600 hover:text-white hover:border-brand-600 transition-all duration-150"
                    >
                      Full analytics
                      <ArrowUpRight size={13} aria-hidden="true" />
                    </Link>
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
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

              {/* Recent accounts — below chart */}
              <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Users
                      size={13}
                      className="text-brand-600 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold text-text-primary">
                      Recent accounts
                    </span>
                  </div>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-muted text-text-secondary border border-border">
                    {data.totalAccounts} total
                  </span>
                </div>

                {data.recentAccounts.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-xs text-text-muted">
                      No accounts yet. Run a bulk import to get started.
                    </p>
                  </div>
                ) : (
                  <>
                    {data.recentAccounts.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border last:border-0"
                      >
                        <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold flex items-center justify-center shrink-0">
                          {getInitials(a.first_name, a.last_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-text-primary truncate">
                            {a.first_name} {a.last_name}
                          </div>
                          <div className="text-[11px] text-text-muted">
                            {a.student_id}
                          </div>
                        </div>
                        <StatusPill status={a.status} />
                      </div>
                    ))}
                    <div className="px-3.5 py-2.5 border-t border-border">
                      <Link
                        to="/accounts"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 border border-brand-600/30 rounded-lg px-2.5 py-1 hover:bg-brand-600 hover:text-white hover:border-brand-600 transition-all duration-150"
                      >
                        <span>View all {data.totalAccounts} accounts</span>
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </Link>
                    </div>
                  </>
                )}
              </div>

            </div>
            {/* end left col */}

            {/* RIGHT RAIL — ISSC drop-offs only */}
            <div>
              {dropOffReports.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="bg-surface-card border border-border rounded-xl overflow-hidden"
                >
                  {/* card header */}
                  <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
                    <div className="flex items-center gap-2">
                      <MapPin
                        size={13}
                        className="text-brand-600 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold text-text-primary">
                        ISSC drop-offs
                      </span>
                    </div>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-status-open-bg text-status-open-text">
                      {dropOffReports.length} pending
                    </span>
                  </div>

                  {/* drop-off rows — scrollable when many items */}
                  <div className="overflow-y-auto max-h-[232px]">
                    {dropOffReports.map((r) => (
                      <div
                        key={r.id}
                        className="px-3.5 py-3 border-b border-border last:border-0"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <p className="text-xs font-semibold text-text-primary leading-snug">
                            {r.title}
                          </p>
                          <Link
                            to="/dropoff"
                            className="shrink-0 px-2.5 py-1 rounded-lg bg-brand-600 text-white text-[11px] font-semibold hover:bg-brand-700 transition-colors"
                          >
                            View
                          </Link>
                        </div>
                        <p className="text-[11px] text-text-muted leading-snug">
                          Finder:{" "}
                          <span className="text-text-secondary font-medium">
                            {claimantName(r.active_claim)}
                          </span>
                          {r.active_claim?.claimant_student_id && (
                            <> ({r.active_claim.claimant_student_id})</>
                          )}
                        </p>
                        <p className="text-[11px] text-text-muted leading-snug">
                          Owner:{" "}
                          <span className="text-text-secondary font-medium">
                            {r.reporter_name}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* footer hint */}
                  <p className="text-[11px] text-text-muted px-3.5 py-2 border-t border-border">
                    Verify the finder's ID at the ISSC office before marking as
                    resolved.
                  </p>
                </motion.div>
              )}
            </div>
            {/* end right rail */}

          </div>
          {/* end lower grid */}
        </>
      )}
    </div>
  );
}
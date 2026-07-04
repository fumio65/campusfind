import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { motion } from 'framer-motion'
import { Download, ChevronDown } from 'lucide-react'
import { staggerContainer, staggerItem } from '../../shared/lib/motion'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'
const PIE_COLORS = ['#0F6E56', '#854F0B', '#5C6B68']

function MetricCard({ label, value }) {
  return (
    <motion.div className="bg-surface-card border border-border rounded-xl p-5" {...staggerItem}>
      <div className="text-xs text-text-secondary mb-1">{label}</div>
      <div className="text-3xl font-bold text-brand-600">{value ?? '—'}</div>
    </motion.div>
  )
}

function EmptyChart({ message }) {
  return (
    <div className="h-44 flex items-center justify-center">
      <p className="text-xs text-text-muted">{message}</p>
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${SERVER_URL}/analytics`)
      .then((r) => r.json())
      .then((body) => {
        if (body.error) throw new Error(body.error)
        setData(body)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const hasReports = data && data.itemsReported > 0
  const hasTrustData = data && data.trustDistribution?.some((d) => d.value > 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-text-primary">Analytics</h2>
        <div className="flex gap-2">
          <button className="px-3 py-2 text-sm rounded-md border border-border-strong flex items-center gap-1 hover:bg-surface-muted transition-colors">
            Filters <ChevronDown size={14} aria-hidden="true" />
          </button>
          <button className="px-3 py-2 text-sm rounded-md border border-border-strong flex items-center gap-1 hover:bg-surface-muted transition-colors">
            <Download size={14} aria-hidden="true" /> PDF
          </button>
          <button className="px-3 py-2 text-sm rounded-md border border-border-strong flex items-center gap-1 hover:bg-surface-muted transition-colors">
            <Download size={14} aria-hidden="true" /> CSV
          </button>
        </div>
      </div>

      {loading && <div className="text-sm text-text-muted py-8 text-center">Loading...</div>}

      {error && (
        <div className="bg-status-rejected-bg text-status-rejected-text text-xs rounded-md px-3 py-2 mb-4">
          Could not load analytics: {error}
        </div>
      )}

      {data && (
        <>
          <motion.div className="grid grid-cols-4 gap-4 mb-5" {...staggerContainer}>
            <MetricCard label="Items reported" value={data.itemsReported} />
            <MetricCard label="Claim approval rate" value={data.itemsReported > 0 ? `${data.claimApprovalRate}%` : null} />
            <MetricCard label="Avg time to recovery" value={data.avgTimeToRecoveryDays != null ? `${data.avgTimeToRecoveryDays}d` : null} />
            <MetricCard label="Avg trust score" value={data.avgTrustScore} />
          </motion.div>

          <div className="grid grid-cols-[1.4fr_1fr] gap-4">
            <div className="bg-surface-card border border-border rounded-xl p-4">
              <div className="text-sm font-semibold mb-2">Reports over time</div>
              {hasReports ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={data.reportsOverTime}>
                    <CartesianGrid stroke="#E2E8E6" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#06433C" strokeWidth={2} dot={false} name="Reports filed" isAnimationActive animationDuration={500} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No reports yet. Charts will populate once students start filing reports." />
              )}
            </div>

            <div className="bg-surface-card border border-border rounded-xl p-4">
              <div className="text-sm font-semibold mb-2">Trust score distribution</div>
              {hasTrustData ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={data.trustDistribution} dataKey="value" nameKey="band" innerRadius={40} outerRadius={65} isAnimationActive animationDuration={500}>
                      {data.trustDistribution.map((entry, i) => (
                        <Cell key={entry.band} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="Trust scores will appear here once student accounts are active." />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
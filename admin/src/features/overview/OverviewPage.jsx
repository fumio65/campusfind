import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Users, FileText, CheckCircle2, TrendingUp } from 'lucide-react'
import StatusPill from '../../shared/components/StatusPill'
import { staggerContainer, staggerItem } from '../../shared/lib/motion'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

function StatCard({ label, value, sub, tone, icon: Icon }) {
  const toneClass = {
    brand: 'text-brand-600',
    open: 'text-status-open-text',
    claimed: 'text-status-claimed-text',
    muted: 'text-text-secondary',
  }[tone] ?? 'text-text-primary'

  return (
    <motion.div className="bg-surface-card border border-border rounded-xl p-5 flex items-center justify-between" {...staggerItem}>
      <div>
        <div className="text-xs text-text-secondary mb-1">{label}</div>
        <div className={`text-3xl font-bold ${toneClass}`}>{value}</div>
        {sub && <div className="text-xs text-text-muted mt-1">{sub}</div>}
      </div>
      <div className="w-10 h-10 rounded-full bg-surface-muted flex items-center justify-center text-text-secondary shrink-0">
        <Icon size={18} aria-hidden="true" />
      </div>
    </motion.div>
  )
}

export default function OverviewPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${SERVER_URL}/overview`)
      .then((r) => r.json())
      .then((body) => {
        if (body.error) throw new Error(body.error)
        setData(body)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h2 className="text-2xl font-bold text-text-primary mb-4">Overview</h2>

      {loading && (
        <div className="text-sm text-text-muted py-8 text-center">Loading...</div>
      )}

      {error && (
        <div className="bg-status-rejected-bg text-status-rejected-text text-xs rounded-md px-3 py-2 mb-4">
          Could not load overview data: {error}
        </div>
      )}

      {data && (
        <>
          <motion.div className="grid grid-cols-4 gap-4 mb-5" {...staggerContainer}>
            <StatCard label="Total accounts" value={data.totalAccounts} sub={`${data.activeAccounts} active`} tone="brand" icon={Users} />
            <StatCard label="Items reported" value={data.totalReports} sub={`${data.openReports} open`} tone="open" icon={FileText} />
            <StatCard label="Resolved" value={data.resolvedReports} sub={data.totalReports > 0 ? `${Math.round((data.resolvedReports / data.totalReports) * 100)}% of total` : 'No reports yet'} tone="muted" icon={CheckCircle2} />
            <StatCard label="Claim approval rate" value={`${data.claimApprovalRate}%`} sub={`${data.totalClaims} claim${data.totalClaims === 1 ? '' : 's'} total`} tone="claimed" icon={TrendingUp} />
          </motion.div>

          {data.openReports > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="bg-status-claimed-bg border border-status-claimed-text/20 rounded-xl p-4 mb-5 flex gap-3 items-start"
            >
              <AlertTriangle size={17} className="text-status-claimed-text shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-status-claimed-text">
                  {data.openReports} open report{data.openReports > 1 ? 's' : ''} awaiting a claim
                </div>
                <p className="text-xs text-status-claimed-text/80 mt-0.5">
                  Students are waiting for someone to claim their lost items.{' '}
                  <Link to="/reports" className="underline font-medium">View reports →</Link>
                </p>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-semibold text-text-primary mb-2">Recent accounts</div>
              {data.recentAccounts.length === 0 ? (
                <div className="bg-surface-card border border-border rounded-xl py-10 text-center">
                  <p className="text-xs text-text-muted">No accounts yet. Run a bulk import to get started.</p>
                </div>
              ) : (
                <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
                  {data.recentAccounts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0">
                      <div>
                        <div className="text-sm font-medium">{a.first_name} {a.last_name}</div>
                        <div className="text-xs text-text-muted">{a.student_id}</div>
                      </div>
                      <StatusPill status={a.status} />
                    </div>
                  ))}
                  <div className="px-4 py-2 border-t border-border">
                    <Link to="/accounts" className="text-xs text-brand-600 font-medium hover:underline">
                      View all {data.totalAccounts} accounts →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="text-sm font-semibold text-text-primary mb-2">Quick links</div>
              <div className="flex flex-col gap-2">
                <Link to="/bulk-import" className="bg-surface-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-border-strong transition-colors">
                  <Users size={16} className="text-brand-600 shrink-0" aria-hidden="true" />
                  <div>
                    <div className="text-sm font-semibold">Bulk import</div>
                    <div className="text-xs text-text-secondary">Upload the Registrar CSV for the new term.</div>
                  </div>
                </Link>
                <Link to="/reports" className="bg-surface-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-border-strong transition-colors">
                  <FileText size={16} className="text-brand-600 shrink-0" aria-hidden="true" />
                  <div>
                    <div className="text-sm font-semibold">Reports</div>
                    <div className="text-xs text-text-secondary">Monitor and manage all lost item reports.</div>
                  </div>
                </Link>
                <Link to="/analytics" className="bg-surface-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-border-strong transition-colors">
                  <TrendingUp size={16} className="text-brand-600 shrink-0" aria-hidden="true" />
                  <div>
                    <div className="text-sm font-semibold">Analytics</div>
                    <div className="text-xs text-text-secondary">Trends, claim rates, and trust distribution.</div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
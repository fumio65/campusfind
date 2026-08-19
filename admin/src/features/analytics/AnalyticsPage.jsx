import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabaseClient'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts'
import { FileText } from 'lucide-react'

const COLORS = ['#06433C', '#0a6b61', '#0d8f82', '#10b3a3', '#13d7c4', '#7ae8e0', '#b8f4f0', '#e0faf8']

const CATEGORY_COLORS = {
  'Electronics': '#06433C',
  'IDs & Cards': '#0a6b61',
  'Bags': '#0d8f82',
  'Clothing': '#10b3a3',
  'Books & Notes': '#13d7c4',
  'Keys': '#7ae8e0',
  'Wallet': '#b8f4f0',
  'Jewelry': '#e0faf8',
  'Documents': '#064e3b',
  'Other': '#6b7280',
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-surface-card border border-border rounded-xl p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-text-primary'}`}>{value}</p>
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </div>
  )
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState({ total: 0, resolved: 0, open: 0, claimed: 0, approved: 0, avgResolutionDays: null })
  const [categoryData, setCategoryData] = useState([])
  const [trendData, setTrendData] = useState([])
  const [topLocations, setTopLocations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      await Promise.all([fetchStats(), fetchCategoryData(), fetchTrendData(), fetchTopLocations()])
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats() {
    const { data, error } = await supabase.from('reports').select('status, created_at, resolved_at')
    if (error || !data) return
    const total = data.length
    const resolved = data.filter((r) => r.status === 'resolved').length
    const open = data.filter((r) => r.status === 'open').length
    const claimed = data.filter((r) => r.status === 'claimed').length
    const approved = data.filter((r) => r.status === 'approved').length
    const resolvedWithDates = data.filter((r) => r.status === 'resolved' && r.resolved_at && r.created_at)
    const avgResolutionDays = resolvedWithDates.length > 0
      ? Math.round(resolvedWithDates.reduce((sum, r) => sum + (new Date(r.resolved_at) - new Date(r.created_at)) / (1000 * 60 * 60 * 24), 0) / resolvedWithDates.length)
      : null
    setStats({ total, resolved, open, claimed, approved, avgResolutionDays })
  }

  async function fetchCategoryData() {
    const { data, error } = await supabase.from('reports').select('category')
    if (error || !data) return
    const counts = {}
    for (const r of data) {
      const cat = r.category ?? 'Uncategorized'
      counts[cat] = (counts[cat] ?? 0) + 1
    }
    setCategoryData(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })))
  }

  async function fetchTrendData() {
    const { data, error } = await supabase.from('reports').select('created_at').order('created_at', { ascending: true })
    if (error || !data) return
    const counts = {}
    for (const r of data) {
      const month = new Date(r.created_at).toLocaleString('default', { month: 'short', year: '2-digit' })
      counts[month] = (counts[month] ?? 0) + 1
    }
    setTrendData(Object.entries(counts).map(([month, count]) => ({ month, count })))
  }

  async function fetchTopLocations() {
    const { data, error } = await supabase.from('reports').select('location').not('location', 'is', null)
    if (error || !data) return
    const counts = {}
    for (const r of data) { if (r.location) counts[r.location] = (counts[r.location] ?? 0) + 1 }
    setTopLocations(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([location, count]) => ({ location, count })))
  }

  function exportReport() {
    const resolutionRate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0
    const maxCategory = categoryData[0]?.value ?? 1
    const maxLocation = topLocations[0]?.count ?? 1
    const maxTrend = Math.max(...trendData.map((t) => t.count), 1)

    const statusRows = [
      { status: 'Open', count: stats.open, color: '#2563eb' },
      { status: 'Claimed', count: stats.claimed, color: '#d97706' },
      { status: 'Approved', count: stats.approved, color: '#16a34a' },
      { status: 'Resolved', count: stats.resolved, color: '#06433C' },
    ]

    const printWindow = window.open('', '_blank')
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>CampusFind Analytics Report</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          @page { size: A4 portrait; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }

          /* Screen layout */
          @media screen {
            body { background: #e5e7eb; min-height: 100vh; display: flex; flex-direction: column; align-items: center; font-family: 'Inter', -apple-system, sans-serif; color: #111827; font-size: 11px; }
            .save-hint { width: 100%; position: sticky; top: 0; z-index: 10; background: #f0fdf4; border-bottom: 2px solid #06433C; padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; }
            .save-hint-text { font-size: 12px; color: #065f46; }
            .save-btn { background: #06433C; color: white; border: none; border-radius: 6px; padding: 8px 18px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
            .save-btn:hover { background: #0a5c53; }
            .page-wrapper { display: flex; justify-content: center; padding: 28px 24px; }
            .page { width: 210mm; min-height: 297mm; background: white; box-shadow: 0 4px 32px rgba(0,0,0,0.18); border-radius: 4px; display: flex; flex-direction: column; }
          }

          /* Print layout */
          @media print {
            .save-hint { display: none !important; }
            body { background: white; font-family: 'Inter', -apple-system, sans-serif; color: #111827; font-size: 11px; }
            .page-wrapper { padding: 0; }
            .page { width: 210mm; min-height: 297mm; background: white; display: flex; flex-direction: column; box-shadow: none; border-radius: 0; }
            .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .stat-card::before { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .bar-fill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .trend-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .status-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            thead tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .footer { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }

          /* Header */
          .header { background: #06433C; color: white; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
          .header-left h1 { font-size: 14px; font-weight: 700; margin-bottom: 1px; }
          .header-left p { font-size: 9px; opacity: 0.75; }
          .header-right { text-align: right; font-size: 9px; opacity: 0.8; line-height: 1.5; }
          .header-badge { display: inline-block; background: rgba(255,255,255,0.15); border-radius: 4px; padding: 2px 8px; font-size: 8px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 4px; }

          /* Body */
          .body { padding: 14px 24px; flex: 1; display: flex; flex-direction: column; gap: 10px; }

          /* Section title */
          .section-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #06433C; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
          .section-title::after { content: ''; flex: 1; height: 1px; background: #d1fae5; }

          /* Stats */
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
          .stat-card { border: 1px solid #e5e7eb; border-radius: 7px; padding: 10px 12px; position: relative; overflow: hidden; }
          .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: #06433C; }
          .stat-label { font-size: 8px; color: #6b7280; font-weight: 500; margin-bottom: 3px; }
          .stat-value { font-size: 20px; font-weight: 700; color: #06433C; line-height: 1; }
          .stat-sub { font-size: 8px; color: #9ca3af; margin-top: 2px; }
          .stat-card.highlight::before { background: #10b981; }
          .stat-card.highlight .stat-value { color: #059669; }

          /* Status cards */
          .status-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
          .status-card { border-radius: 7px; padding: 8px 10px; text-align: center; border: 1px solid #e5e7eb; }
          .status-value { font-size: 18px; font-weight: 700; margin-bottom: 1px; }
          .status-label { font-size: 8px; color: #6b7280; font-weight: 500; }
          .status-pct { font-size: 8px; color: #9ca3af; margin-top: 1px; }

          /* Three col */
          .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }

          /* Bar chart */
          .bar-chart { display: flex; flex-direction: column; gap: 5px; }
          .bar-row { display: flex; align-items: center; gap: 6px; }
          .bar-label { font-size: 9px; color: #374151; width: 90px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
          .bar-track { flex: 1; height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
          .bar-fill { height: 100%; border-radius: 4px; }
          .bar-count { font-size: 9px; font-weight: 600; color: #06433C; width: 20px; text-align: right; flex-shrink: 0; }

          /* Trend chart */
          .trend-chart { display: flex; align-items: flex-end; gap: 4px; height: 70px; }
          .trend-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; height: 100%; justify-content: flex-end; }
          .trend-bar { width: 100%; background: #06433C; border-radius: 3px 3px 0 0; min-height: 3px; }
          .trend-label { font-size: 7px; color: #9ca3af; text-align: center; white-space: nowrap; }
          .trend-count { font-size: 7px; color: #06433C; font-weight: 600; }

          /* Table */
          table { width: 100%; border-collapse: collapse; font-size: 9px; }
          thead tr { background: #f0fdf4; }
          th { text-align: left; padding: 5px 8px; font-weight: 600; color: #065f46; font-size: 8px; border-bottom: 1px solid #d1fae5; }
          td { padding: 4px 8px; border-bottom: 1px solid #f3f4f6; color: #374151; }
          tr:last-child td { border-bottom: none; }
          .td-num { font-weight: 600; color: #06433C; }

          /* Footer */
          .footer { padding: 8px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 8px; color: #9ca3af; flex-shrink: 0; margin-top: auto; }
          .footer strong { color: #06433C; }
        </style>
      </head>
      <body>

        <!-- Save hint (screen only) -->
        <div class="save-hint">
          <span class="save-hint-text">📄 Preview — A4 size, fits one page when saved as PDF.</span>
          <button class="save-btn" onclick="window.print()">🖨️ Save as PDF</button>
        </div>

        <div class="page-wrapper">
          <div class="page">

            <!-- Header -->
            <div class="header">
              <div class="header-left">
                <div class="header-badge">Analytics Report</div>
                <h1>CampusFind Lost &amp; Found Management System</h1>
                <p>Northwestern Samar State University · ISSC Office · Academic Year ${new Date().getFullYear()}</p>
              </div>
              <div class="header-right">
                <div>Generated on</div>
                <div style="font-weight:600;">${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <div style="opacity:0.6;">${new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            <div class="body">

              <!-- Summary -->
              <div>
                <div class="section-title">Executive Summary</div>
                <div class="stats-grid">
                  <div class="stat-card">
                    <div class="stat-label">Total Reports</div>
                    <div class="stat-value">${stats.total}</div>
                    <div class="stat-sub">All time</div>
                  </div>
                  <div class="stat-card highlight">
                    <div class="stat-label">Resolved</div>
                    <div class="stat-value">${stats.resolved}</div>
                    <div class="stat-sub">${resolutionRate}% resolution rate</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Currently Open</div>
                    <div class="stat-value">${stats.open}</div>
                    <div class="stat-sub">Awaiting finder</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Avg. Resolution</div>
                    <div class="stat-value">${stats.avgResolutionDays !== null ? `${stats.avgResolutionDays}d` : '—'}</div>
                    <div class="stat-sub">Days to resolve</div>
                  </div>
                </div>
              </div>

              <!-- Status -->
              <div>
                <div class="section-title">Status Breakdown</div>
                <div class="status-grid">
                  ${statusRows.map((s) => `
                    <div class="status-card">
                      <div class="status-value" style="color:${s.color};">${s.count}</div>
                      <div class="status-label">${s.status}</div>
                      <div class="status-pct">${stats.total > 0 ? Math.round((s.count / stats.total) * 100) : 0}% of total</div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Trend + Category + Locations -->
              <div class="three-col">
                <div>
                  <div class="section-title">Monthly Trend</div>
                  ${trendData.length === 0
                    ? '<p style="font-size:9px;color:#9ca3af;">No data yet.</p>'
                    : `<div class="trend-chart">
                        ${trendData.map((t) => `
                          <div class="trend-bar-wrap">
                            <div class="trend-count">${t.count}</div>
                            <div class="trend-bar" style="height:${Math.round((t.count / maxTrend) * 55)}px;"></div>
                            <div class="trend-label">${t.month}</div>
                          </div>
                        `).join('')}
                      </div>`}
                </div>
                <div>
                  <div class="section-title">By Category</div>
                  <div class="bar-chart">
                    ${categoryData.length === 0
                      ? '<p style="font-size:9px;color:#9ca3af;">No data yet.</p>'
                      : categoryData.slice(0, 7).map((c) => `
                        <div class="bar-row">
                          <div class="bar-label">${c.name}</div>
                          <div class="bar-track">
                            <div class="bar-fill" style="width:${Math.round((c.value / maxCategory) * 100)}%;background:#06433C;"></div>
                          </div>
                          <div class="bar-count">${c.value}</div>
                        </div>
                      `).join('')}
                  </div>
                </div>
                <div>
                  <div class="section-title">Top Locations</div>
                  <div class="bar-chart">
                    ${topLocations.length === 0
                      ? '<p style="font-size:9px;color:#9ca3af;">No data yet.</p>'
                      : topLocations.map((l, i) => `
                        <div class="bar-row">
                          <div class="bar-label">${i + 1}. ${l.location}</div>
                          <div class="bar-track">
                            <div class="bar-fill" style="width:${Math.round((l.count / maxLocation) * 100)}%;background:#0d8f82;"></div>
                          </div>
                          <div class="bar-count">${l.count}</div>
                        </div>
                      `).join('')}
                  </div>
                </div>
              </div>

              <!-- Monthly log -->
              <div>
                <div class="section-title">Monthly Report Log</div>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Month</th>
                      <th>Reports Filed</th>
                      <th>% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${trendData.length === 0
                      ? '<tr><td colspan="4" style="color:#9ca3af;text-align:center;padding:10px;">No data available.</td></tr>'
                      : trendData.map((t, i) => `
                        <tr>
                          <td style="color:#9ca3af;">${i + 1}</td>
                          <td>${t.month}</td>
                          <td class="td-num">${t.count}</td>
                          <td>${stats.total > 0 ? Math.round((t.count / stats.total) * 100) : 0}%</td>
                        </tr>
                      `).join('')}
                  </tbody>
                </table>
              </div>

            </div>

            <!-- Footer -->
            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Confidential · ${new Date().getFullYear()}</div>
            </div>

          </div>
        </div>

      </body>
      </html>
    `

    printWindow.document.write(html)
    printWindow.document.close()
  }

  const resolutionRate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold text-text-primary">Analytics</h2>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface-card border border-border rounded-xl p-4 animate-pulse h-20" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-surface-card border border-border rounded-xl p-4 animate-pulse h-64" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-text-primary">Analytics</h2>
        <button
          onClick={exportReport}
          className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
        >
          <FileText size={14} />
          Export Report
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Reports" value={stats.total} />
        <StatCard label="Resolved" value={stats.resolved} sub={`${resolutionRate}% resolution rate`} color="text-status-open-text" />
        <StatCard label="Open" value={stats.open} color="text-brand-600" />
        <StatCard label="Avg Resolution" value={stats.avgResolutionDays !== null ? `${stats.avgResolutionDays}d` : '—'} sub="days to resolve" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Reports filed per month</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#06433C" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Reports by category</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] ?? COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Reports by status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={[
                { status: 'Open', count: stats.open },
                { status: 'Claimed', count: stats.claimed },
                { status: 'Approved', count: stats.approved },
                { status: 'Resolved', count: stats.resolved },
              ]}
              margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="status" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#06433C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Top locations</h3>
          {topLocations.length === 0 ? (
            <p className="text-xs text-text-muted">No location data yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {topLocations.map((loc, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-text-muted w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-text-primary truncate">{loc.location}</p>
                      <p className="text-xs text-text-muted shrink-0 ml-2">{loc.count}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${(loc.count / (topLocations[0]?.count ?? 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
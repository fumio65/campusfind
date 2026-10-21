import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { FileText } from 'lucide-react'
import { getAdminCache, setAdminCache } from '../../../shared/lib/adminCache'
import { SkeletonBlock } from '../../../shared/components/admin/Skeleton'

const TRUST_REASON_LABELS = {
  claim_rejected: 'Claim rejected',
  repeat_rejections_30d: 'Repeat rejections (30d)',
  no_show_handoff: 'No-show at handoff',
  claim_approved_handoff_completed: 'Handoff completed',
  issc_dropoff_returned: 'ISSC drop-off returned',
  tip_credited: 'Tip credited',
}

const RESOLVED_VIA_LABELS = {
  handoff: 'Direct handoff',
  issc_dropoff: 'ISSC drop-off',
  issc_walkin_pickup: 'ISSC walk-in pickup',
  tip_credited: 'Tip led to recovery',
}

const COLORS = ['#06433C', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0d8f82', '#db2777', '#475569']

const CATEGORY_COLORS = {
  'Electronics': '#06433C',
  'IDs & Cards': '#2563eb',
  'Bags': '#d97706',
  'Clothing': '#7c3aed',
  'Books & Notes': '#0d8f82',
  'Keys': '#ea580c',
  'Wallet': '#db2777',
  'Jewelry': '#4f46e5',
  'Documents': '#1e293b',
  'Other': '#6b7280',
}

// Title-cases each word but keeps short embedded acronyms (EPM, NRM, CEM,
// MT...) and small connector words (of/in/and/...) looking natural, e.g.
// "BACHELOR OF SCIENCE IN ENVIRONMENTAL SCIENCE (EPM)" ->
// "Bachelor of Science in Environmental Science (EPM)".
const SMALL_WORDS = new Set(['of', 'in', 'and', 'the', 'for', 'a', 'to'])
function titleCase(str) {
  if (!str) return str
  let wordIndex = 0
  return str.replace(/[A-Za-z]+/g, (word) => {
    const isFirst = wordIndex === 0
    wordIndex += 1
    const lower = word.toLowerCase()
    if (word.length <= 3 && word === word.toUpperCase() && !isFirst && !SMALL_WORDS.has(lower)) {
      return word
    }
    if (SMALL_WORDS.has(lower) && !isFirst) return lower
    return word[0].toUpperCase() + word.slice(1).toLowerCase()
  })
}

function BarList({ data, barColor = '#06433C' }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs font-medium text-text-primary">{d.name}</p>
              <p className="text-xs text-text-muted shrink-0">{d.value}</p>
            </div>
            <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(d.value / maxValue) * 100}%`, background: barColor }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
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
  // Last loaded charts, so returning to this tab shows them immediately
  // while load() refreshes them in the background.
  const cached = getAdminCache('analytics')
  // Revisiting with cached charts: draw them immediately instead of
  // replaying the grow-in animation (which made a revisit look like a reload).
  const animateCharts = useRef(!cached).current
  const [stats, setStats] = useState(cached?.stats ?? { total: 0, resolved: 0, open: 0, claimed: 0, approved: 0, avgResolutionDays: null })
  const [categoryData, setCategoryData] = useState(cached?.categoryData ?? [])
  const [trendData, setTrendData] = useState(cached?.trendData ?? [])
  const [topLocations, setTopLocations] = useState(cached?.topLocations ?? [])
  const [claimsFunnel, setClaimsFunnel] = useState(cached?.claimsFunnel ?? { pending: 0, approved: 0, rejected: 0, approvalRate: 0 })
  const [trustDistribution, setTrustDistribution] = useState(cached?.trustDistribution ?? [])
  const [avgTrustScore, setAvgTrustScore] = useState(cached?.avgTrustScore ?? null)
  const [reportTypeData, setReportTypeData] = useState(cached?.reportTypeData ?? [])
  const [resolvedViaData, setResolvedViaData] = useState(cached?.resolvedViaData ?? [])
  const [tipsStats, setTipsStats] = useState(cached?.tipsStats ?? { total: 0, credited: 0, rate: 0 })
  const [trustEventReasons, setTrustEventReasons] = useState(cached?.trustEventReasons ?? [])
  const [accountStatus, setAccountStatus] = useState(cached?.accountStatus ?? { active: 0, deactivated: 0 })
  const [accountsByProgram, setAccountsByProgram] = useState(cached?.accountsByProgram ?? [])
  const [accountsByDepartment, setAccountsByDepartment] = useState(cached?.accountsByDepartment ?? [])
  const [accountsByYear, setAccountsByYear] = useState(cached?.accountsByYear ?? [])
  const [lostByDepartment, setLostByDepartment] = useState(cached?.lostByDepartment ?? [])
  const [lostByProgram, setLostByProgram] = useState(cached?.lostByProgram ?? [])
  const [loading, setLoading] = useState(!cached)
  // Bumped each time load() finishes, so the snapshot below is saved after
  // background refreshes too (loading stays false for those).
  const [loadedVersion, setLoadedVersion] = useState(0)

  useEffect(() => { load() }, [])

  // Save the finished snapshot once every chart has loaded.
  useEffect(() => {
    if (loadedVersion > 0) setAdminCache('analytics', { stats, categoryData, trendData, topLocations, claimsFunnel, trustDistribution, avgTrustScore, reportTypeData, resolvedViaData, tipsStats, trustEventReasons, accountStatus, accountsByProgram, accountsByDepartment, accountsByYear, lostByDepartment, lostByProgram })
  }, [loadedVersion])

  async function load() {
    if (!getAdminCache('analytics')) setLoading(true)
    try {
      await Promise.all([
        fetchStats(),
        fetchCategoryData(),
        fetchTrendData(),
        fetchTopLocations(),
        fetchClaimsFunnel(),
        fetchTrustDistribution(),
        fetchReportTypeAndResolution(),
        fetchTipsStats(),
        fetchTrustEventReasons(),
        fetchAccountsBreakdown(),
        fetchLostByDepartmentAndProgram(),
      ])
    } finally {
      setLoading(false)
      setLoadedVersion((v) => v + 1)
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

  async function fetchClaimsFunnel() {
    const { data, error } = await supabase.from('claims').select('status')
    if (error || !data) return
    const pending = data.filter((c) => c.status === 'pending').length
    const approved = data.filter((c) => c.status === 'approved').length
    const rejected = data.filter((c) => c.status === 'rejected').length
    const decided = approved + rejected
    const approvalRate = decided > 0 ? Math.round((approved / decided) * 100) : 0
    setClaimsFunnel({ pending, approved, rejected, approvalRate })
  }

  async function fetchTrustDistribution() {
    const { data, error } = await supabase.from('users').select('trust_score').eq('role', 'student')
    if (error || !data) return
    const bands = { '90-100': 0, '70-89': 0, 'Below 70': 0 }
    for (const u of data) {
      const s = u.trust_score ?? 100
      if (s >= 90) bands['90-100']++
      else if (s >= 70) bands['70-89']++
      else bands['Below 70']++
    }
    setTrustDistribution(Object.entries(bands).map(([band, value]) => ({ band, value })))
    setAvgTrustScore(data.length > 0 ? Math.round(data.reduce((sum, u) => sum + (u.trust_score ?? 100), 0) / data.length) : null)
  }

  async function fetchReportTypeAndResolution() {
    const { data, error } = await supabase.from('reports').select('type, status, resolved_via')
    if (error || !data) return
    const lost = data.filter((r) => r.type === 'lost').length
    const walkin = data.filter((r) => r.type === 'found_walkin').length
    setReportTypeData([
      { name: 'Reported lost by students', value: lost },
      { name: 'ISSC walk-in drop-offs', value: walkin },
    ])

    const counts = {}
    for (const r of data) {
      if (r.status === 'resolved' && r.resolved_via) counts[r.resolved_via] = (counts[r.resolved_via] ?? 0) + 1
    }
    setResolvedViaData(Object.entries(counts).map(([key, value]) => ({ name: RESOLVED_VIA_LABELS[key] ?? key, value })))
  }

  async function fetchTipsStats() {
    const { data, error } = await supabase.from('tips').select('credited_for_recovery')
    if (error || !data) return
    const total = data.length
    const credited = data.filter((t) => t.credited_for_recovery).length
    const rate = total > 0 ? Math.round((credited / total) * 100) : 0
    setTipsStats({ total, credited, rate })
  }

  async function fetchTrustEventReasons() {
    const { data, error } = await supabase.from('trust_score_events').select('reason')
    if (error || !data) return
    const counts = {}
    for (const e of data) counts[e.reason] = (counts[e.reason] ?? 0) + 1
    setTrustEventReasons(
      Object.entries(TRUST_REASON_LABELS).map(([key, name]) => ({ name, value: counts[key] ?? 0 }))
    )
  }

  async function fetchAccountsBreakdown() {
    // program/department come from the structured programs table now
    // (program_code/department_code, joined here for their short codes) -
    // the old free-text `program` column is only a pre-migration fallback
    // for any account that somehow still has no program_code set.
    const { data, error } = await supabase
      .from('users')
      .select('program, program_code, department_code, year_level, status, programs:program_code ( program_name, department_name )')
      .eq('role', 'student')
    if (error || !data) return

    setAccountStatus({
      active: data.filter((u) => u.status === 'active').length,
      deactivated: data.filter((u) => u.status === 'deactivated').length,
    })

    const progCounts = {}
    for (const u of data) {
      const p = titleCase(u.programs?.program_name) || u.program?.trim() || 'Unspecified'
      progCounts[p] = (progCounts[p] ?? 0) + 1
    }
    setAccountsByProgram(
      Object.entries(progCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }))
    )

    const deptCounts = {}
    for (const u of data) {
      const d = u.programs?.department_name || 'Unspecified'
      deptCounts[d] = (deptCounts[d] ?? 0) + 1
    }
    setAccountsByDepartment(
      Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))
    )

    const yearCounts = {}
    for (const u of data) {
      const y = u.year_level?.trim() || 'Unspecified'
      yearCounts[y] = (yearCounts[y] ?? 0) + 1
    }
    setAccountsByYear(
      Object.entries(yearCounts)
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([name, value]) => ({ name, value }))
    )
  }

  // How often each department/program's students actually file a lost
  // report - distinct from "Students by Department/Program" above (which is
  // just headcount). This is reports.reporter_id joined to the reporter's
  // own department_code/program_code, counting only type === 'lost' (a
  // student report), not ISSC walk-in intake which has no student reporter.
  async function fetchLostByDepartmentAndProgram() {
    const { data, error } = await supabase
      .from('reports')
      .select('type, reporter:users!reports_reporter_id_fkey(department_code, program_code, programs:program_code(department_name, program_name))')
      .eq('type', 'lost')
    if (error || !data) return

    const deptCounts = {}
    const progCounts = {}
    for (const r of data) {
      const dept = r.reporter?.programs?.department_name || 'Unspecified'
      deptCounts[dept] = (deptCounts[dept] ?? 0) + 1
      const prog = titleCase(r.reporter?.programs?.program_name) || 'Unspecified'
      progCounts[prog] = (progCounts[prog] ?? 0) + 1
    }
    setLostByDepartment(Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })))
    setLostByProgram(Object.entries(progCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value })))
  }

  function exportReport() {
    const resolutionRate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0
    const maxCategory = categoryData[0]?.value ?? 1
    const maxLocation = topLocations[0]?.count ?? 1
    const maxTrend = Math.max(...trendData.map((t) => t.count), 1)
    const maxProgram = accountsByProgram[0]?.value ?? 1
    const maxDepartment = accountsByDepartment[0]?.value ?? 1

    const lostRateByDepartment = lostByDepartment
      .map((d) => {
        const students = accountsByDepartment.find((a) => a.name === d.name)?.value ?? 0
        return { name: d.name, value: d.value, students, rate: students > 0 ? d.value / students : null }
      })
      .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))
    const maxLostProgram = lostByProgram[0]?.value ?? 1
    const maxReason = Math.max(...trustEventReasons.map((r) => r.value), 1)
    const maxTrustBand = Math.max(...trustDistribution.map((t) => t.value), 1)
    const totalReportType = Math.max(reportTypeData.reduce((sum, r) => sum + r.value, 0), 1)

    const statusRows = [
      { status: 'Open', count: stats.open, color: '#2563eb' },
      { status: 'Claimed', count: stats.claimed, color: '#d97706' },
      { status: 'Approved', count: stats.approved, color: '#16a34a' },
      { status: 'Resolved', count: stats.resolved, color: '#06433C' },
    ]

    const claimsRows = [
      { status: 'Pending', count: claimsFunnel.pending, color: '#d97706' },
      { status: 'Approved', count: claimsFunnel.approved, color: '#16a34a' },
      { status: 'Rejected', count: claimsFunnel.rejected, color: '#dc2626' },
    ]

    const resolutionMethodRows = resolvedViaData
    const totalResolvedViaKnown = Math.max(resolvedViaData.reduce((sum, r) => sum + r.value, 0), 1)

    // ---------------------------------------------------------------------
    // Narrative text: every sentence below is derived from the same data
    // already computed above, so the report reads as an analysis instead
    // of a wall of charts - and stays accurate as the underlying data
    // changes, with no manual rewriting per report.
    // ---------------------------------------------------------------------
    const periodLabel = trendData.length > 0
      ? (trendData.length === 1 ? trendData[0].month : `${trendData[0].month} - ${trendData[trendData.length - 1].month}`)
      : 'the recorded period'

    const lostRatesKnown = lostRateByDepartment.filter((d) => d.rate !== null)
    const topLostDept = lostRatesKnown[0] ?? null
    const secondLostDept = lostRatesKnown[1] ?? null
    const topLostProgram = lostByProgram[0] ?? null
    const categoryTotal = Math.max(categoryData.reduce((sum, c) => sum + c.value, 0), 1)
    const topCategory = categoryData[0] ?? null
    const topLocation = topLocations[0] ?? null
    const topResolutionMethod = [...resolvedViaData].sort((a, b) => b.value - a.value)[0] ?? null
    const resolutionMethodShare = topResolutionMethod ? Math.round((topResolutionMethod.value / totalResolvedViaKnown) * 100) : null
    const topTrustBand = [...trustDistribution].sort((a, b) => b.value - a.value)[0] ?? null
    const topTrustReason = [...trustEventReasons].sort((a, b) => b.value - a.value)[0] ?? null
    const walkInEntry = reportTypeData.find((r) => /walk/i.test(r.name)) ?? null
    const walkInShare = walkInEntry ? Math.round((walkInEntry.value / totalReportType) * 100) : null
    const claimsReviewed = claimsFunnel.approved + claimsFunnel.rejected
    const rejectionShare = claimsReviewed > 0 ? Math.round((claimsFunnel.rejected / claimsReviewed) * 100) : null
    const topDeptAccounts = accountsByDepartment[0] ?? null
    const topProgramAccounts = accountsByProgram[0] ?? null
    const topYearAccounts = [...accountsByYear].sort((a, b) => b.value - a.value)[0] ?? null

    const openingNarrative = `This report summarizes Lost &amp; Found activity handled through the CampusFind system by the ISSC Office over ${periodLabel}. It covers report volume and resolution outcomes, claim integrity, trust-score activity, and which departments and programs are most affected, to support decisions on awareness and prevention efforts.`

    const execSummary = `The system logged ${stats.total} report${stats.total === 1 ? '' : 's'} during this period, of which ${stats.resolved} (${resolutionRate}%) ${stats.resolved === 1 ? 'was' : 'were'} resolved` +
      (stats.avgResolutionDays !== null ? `, with an average resolution time of ${stats.avgResolutionDays} day${stats.avgResolutionDays === 1 ? '' : 's'}` : '') +
      `. Claims were approved at a ${claimsFunnel.approvalRate}% rate (${claimsFunnel.approved} approved, ${claimsFunnel.rejected} rejected)` +
      (topLostDept ? `, and ${topLostDept.name} students filed lost reports at the highest rate of any department, at ${topLostDept.rate.toFixed(2)} reports per student` : '') +
      `.`

    const keyFindings = []
    if (topLostDept) {
      if (secondLostDept && secondLostDept.rate > 0) {
        keyFindings.push(`${topLostDept.name} has the highest lost-report rate per student (${topLostDept.rate.toFixed(2)}/student) - about ${(topLostDept.rate / secondLostDept.rate).toFixed(1)}x the next-highest department, ${secondLostDept.name} (${secondLostDept.rate.toFixed(2)}/student).`)
      } else {
        keyFindings.push(`${topLostDept.name} has the highest lost-report rate per student, at ${topLostDept.rate.toFixed(2)} reports per student.`)
      }
    }
    if (topLostProgram) {
      keyFindings.push(`${topLostProgram.name} files more lost reports than any other program (${topLostProgram.value} report${topLostProgram.value === 1 ? '' : 's'}).`)
    }
    if (topCategory) {
      keyFindings.push(`${topCategory.name} is the most commonly lost item category, making up ${Math.round((topCategory.value / categoryTotal) * 100)}% of all reports.`)
    }
    if (topLocation) {
      keyFindings.push(`${topLocation.location} is the most frequently reported location for lost items (${topLocation.count} report${topLocation.count === 1 ? '' : 's'}).`)
    }
    if (rejectionShare !== null && rejectionShare >= 20) {
      keyFindings.push(`${rejectionShare}% of reviewed claims were rejected, which may be worth reviewing for recurring causes.`)
    }
    if (topResolutionMethod && resolutionMethodShare !== null) {
      keyFindings.push(`Most resolved items (${resolutionMethodShare}%) were recovered via ${topResolutionMethod.name.toLowerCase()}.`)
    }
    if (keyFindings.length === 0) {
      keyFindings.push('Not enough data has been recorded yet to surface meaningful patterns. Findings will populate here as more reports are filed.')
    }

    const recommendations = []
    if (topLostDept && topLostDept.rate > 0) {
      recommendations.push(`Prioritize a lost-item prevention/awareness campaign for ${topLostDept.name}, given its disproportionately high report rate per student.`)
    }
    if (topCategory) {
      recommendations.push(`Promote reminders about securing ${topCategory.name.toLowerCase()} in high-traffic areas such as ${topLocation ? topLocation.location : 'common campus locations'}.`)
    }
    if (rejectionShare !== null && rejectionShare >= 20) {
      recommendations.push('Review recurring causes of claim rejection with ISSC staff to see if clearer claim guidelines would reduce the rejection rate.')
    }
    if (walkInShare !== null && walkInShare >= 40) {
      recommendations.push('A large share of items arrive via ISSC walk-in drop-off rather than direct student-to-student handoff; continuing to promote the in-app handoff flow may speed up recovery times.')
    }
    if (stats.total > 0 && resolutionRate < 50) {
      recommendations.push(`The overall resolution rate (${resolutionRate}%) has room to improve; closer follow-up on reports still open past the average resolution time may help.`)
    }
    if (recommendations.length === 0) {
      recommendations.push('Continue monitoring monthly trends as more data accumulates; no urgent action items are indicated by the current dataset.')
    }

    const claimsNote = claimsReviewed > 0
      ? `${claimsFunnel.approvalRate}% of reviewed claims were approved (${claimsFunnel.approved} approved, ${claimsFunnel.rejected} rejected).`
      : 'No claims have been reviewed yet.'
    const trustReasonNote = topTrustReason && topTrustReason.value > 0
      ? `"${topTrustReason.name}" is the most common trust-score event this period (${topTrustReason.value} occurrence${topTrustReason.value === 1 ? '' : 's'}).`
      : 'No trust-score activity has been recorded yet.'
    const resolutionMethodNote = topResolutionMethod && resolutionMethodShare !== null
      ? `${topResolutionMethod.name} accounts for ${resolutionMethodShare}% of resolved items.`
      : 'No items have been resolved yet.'
    const trustDistNote = topTrustBand && topTrustBand.value > 0
      ? `Most students fall in the "${topTrustBand.band}" trust band.`
      : 'No trust score data is available yet.'
    const reportTypeNote = walkInShare !== null
      ? `ISSC walk-in drop-offs make up ${walkInShare}% of all lost/found activity logged this period.`
      : 'No reports have been logged yet.'
    const trendNote = trendData.length >= 2
      ? (() => {
          const last = trendData[trendData.length - 1]
          const prev = trendData[trendData.length - 2]
          if (prev.count === 0) return `${last.month} saw ${last.count} report${last.count === 1 ? '' : 's'} filed.`
          const change = Math.round(((last.count - prev.count) / prev.count) * 100)
          if (change > 0) return `Reports rose ${change}% from ${prev.month} to ${last.month}.`
          if (change < 0) return `Reports fell ${Math.abs(change)}% from ${prev.month} to ${last.month}.`
          return `Report volume held steady from ${prev.month} to ${last.month}.`
        })()
      : 'Not enough months of data yet to show a trend.'
    const categoryNote = topCategory
      ? `${topCategory.name} is the most reported category, ahead of ${categoryData[1] ? categoryData[1].name : 'all others'}.`
      : 'No category data is available yet.'
    const locationNote = topLocation
      ? `${topLocation.location} accounts for the most reports among all logged locations.`
      : 'No location data is available yet.'
    const deptAccountsNote = topDeptAccounts
      ? `${topDeptAccounts.name} has the most registered student accounts (${topDeptAccounts.value}).`
      : 'No student accounts have department data yet.'
    const programAccountsNote = topProgramAccounts
      ? `${topProgramAccounts.name} is the most represented program by registered accounts (${topProgramAccounts.value}).`
      : 'No student accounts have program data yet.'
    const yearAccountsNote = topYearAccounts
      ? `${topYearAccounts.name} students make up the largest share of registered accounts (${topYearAccounts.value}).`
      : 'No year-level data is available yet.'
    const lostProgramNote = topLostProgram
      ? `${topLostProgram.name} leads all programs in lost reports filed, with ${topLostProgram.value}.`
      : 'No lost reports have been filed yet.'

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
            body { background: #e5e7eb; min-height: 100vh; display: flex; flex-direction: column; align-items: center; font-family: 'Inter', -apple-system, sans-serif; color: #111827; font-size: 12px; }
            .save-hint { width: 100%; position: sticky; top: 0; z-index: 10; background: #f0fdf4; border-bottom: 2px solid #06433C; padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; }
            .save-hint-text { font-size: 12px; color: #065f46; }
            .save-btn { background: #06433C; color: white; border: none; border-radius: 6px; padding: 8px 18px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
            .save-btn:hover { background: #0a5c53; }
            .page-wrapper { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 28px 24px; }
            .page { width: 210mm; min-height: 297mm; background: white; box-shadow: 0 4px 32px rgba(0,0,0,0.18); border-radius: 4px; display: flex; flex-direction: column; }
          }

          /* Print layout */
          @media print {
            .save-hint { display: none !important; }
            body { background: white; font-family: 'Inter', -apple-system, sans-serif; color: #111827; font-size: 12px; }
            .page-wrapper { padding: 0; gap: 0; }
            .page { width: 210mm; min-height: 297mm; background: white; display: flex; flex-direction: column; box-shadow: none; border-radius: 0; page-break-after: always; break-after: page; }
            .page:last-child { page-break-after: auto; break-after: auto; }
            .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .stat-card::before { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .bar-fill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .trend-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .status-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            thead tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .footer { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }

          /* Cover header (page 1 only) */
          .header { background: #06433C; color: white; padding: 22px 28px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
          .header-left h1 { font-size: 17px; font-weight: 700; margin-bottom: 3px; }
          .header-left p { font-size: 10.5px; opacity: 0.75; }
          .header-right { text-align: right; font-size: 10.5px; opacity: 0.85; line-height: 1.6; }
          .header-badge { display: inline-block; background: rgba(255,255,255,0.15); border-radius: 4px; padding: 3px 9px; font-size: 9px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 6px; }

          /* Slim header (pages 2+) */
          .page-header { background: #f0fdf4; border-bottom: 2px solid #06433C; padding: 14px 28px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
          .page-header-title { font-size: 13px; font-weight: 700; color: #06433C; }
          .page-header-sub { font-size: 9.5px; color: #065f46; opacity: 0.8; margin-top: 1px; }
          .page-header-right { font-size: 9.5px; color: #6b7280; text-align: right; }

          /* Body */
          .body { padding: 22px 28px; flex: 1; display: flex; flex-direction: column; gap: 22px; }

          /* Section title */
          .section-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #06433C; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
          .section-title::after { content: ''; flex: 1; height: 1px; background: #d1fae5; }
          .section-note { font-size: 9.5px; color: #6b7280; margin: -4px 0 10px; }

          /* Stats */
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
          .stat-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; position: relative; overflow: hidden; }
          .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: #06433C; }
          .stat-label { font-size: 9.5px; color: #6b7280; font-weight: 500; margin-bottom: 5px; }
          .stat-value { font-size: 26px; font-weight: 700; color: #06433C; line-height: 1; }
          .stat-sub { font-size: 9.5px; color: #9ca3af; margin-top: 4px; }
          .stat-card.highlight::before { background: #10b981; }
          .stat-card.highlight .stat-value { color: #059669; }

          /* Status cards */
          .status-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
          .status-card { border-radius: 8px; padding: 12px 14px; text-align: center; border: 1px solid #e5e7eb; }
          .status-value { font-size: 22px; font-weight: 700; margin-bottom: 2px; }
          .status-label { font-size: 9.5px; color: #6b7280; font-weight: 500; }
          .status-pct { font-size: 9px; color: #9ca3af; margin-top: 2px; }

          /* Three col */
          .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 22px; }

          /* Bar chart - label+value stacked above a full-width track, so long
             department/program names wrap instead of getting cut off */
          .bar-chart { display: flex; flex-direction: column; gap: 10px; }
          .bar-row { display: flex; flex-direction: column; gap: 4px; }
          .bar-row-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
          .bar-label { font-size: 10.5px; color: #374151; font-weight: 500; line-height: 1.3; }
          .bar-track { height: 7px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
          .bar-fill { height: 100%; border-radius: 4px; }
          .bar-count { font-size: 10.5px; font-weight: 600; color: #06433C; flex-shrink: 0; white-space: nowrap; }

          /* Trend chart */
          .trend-chart { display: flex; align-items: flex-end; gap: 6px; height: 110px; }
          .trend-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; }
          .trend-bar { width: 100%; background: #06433C; border-radius: 3px 3px 0 0; min-height: 3px; }
          .trend-label { font-size: 9px; color: #9ca3af; text-align: center; white-space: nowrap; }
          .trend-count { font-size: 9px; color: #06433C; font-weight: 600; }

          /* Table */
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          thead tr { background: #f0fdf4; }
          th { text-align: left; padding: 8px 10px; font-weight: 600; color: #065f46; font-size: 9.5px; border-bottom: 1px solid #d1fae5; }
          td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; color: #374151; }
          tr:last-child td { border-bottom: none; }
          .td-num { font-weight: 600; color: #06433C; }

          /* Footer */
          .footer { padding: 12px 28px; background: #f9fafb; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; color: #9ca3af; flex-shrink: 0; margin-top: auto; }
          .footer strong { color: #06433C; }

          /* Narrative text */
          .narrative { font-size: 11px; color: #374151; line-height: 1.65; }
          .narrative + .narrative { margin-top: 4px; }
          .findings-list, .recommend-list { list-style: none; display: flex; flex-direction: column; gap: 9px; }
          .findings-list li, .recommend-list li { font-size: 10.5px; color: #374151; line-height: 1.55; padding-left: 20px; position: relative; }
          .findings-list li::before { content: '•'; position: absolute; left: 2px; top: 0; color: #06433C; font-weight: 700; font-size: 13px; }
          .recommend-list { counter-reset: rec; }
          .recommend-list li { counter-increment: rec; }
          .recommend-list li::before { content: counter(rec) '.'; position: absolute; left: 0; top: 0; color: #06433C; font-weight: 700; font-size: 10.5px; }
          .conclusion-box { background: #f0fdf4; border: 1px solid #d1fae5; border-radius: 8px; padding: 14px 16px; font-size: 10.5px; color: #065f46; line-height: 1.6; }

          /* Print pagination - without these, a section whose content lands
             right at a physical page edge gets sliced in half: a stat-card
             row split across two sheets, a table row cut in two, or a
             section title stranded at the bottom of one page with its
             content starting on the next. These keep each logical chunk
             together, letting it move to the next sheet as a whole instead
             of being cut mid-element. (No visual effect on screen.) */
          .body > div { break-inside: avoid-page; page-break-inside: avoid; }
          .stats-grid, .status-grid, .three-col { break-inside: avoid-page; page-break-inside: avoid; }
          .stat-card, .status-card { break-inside: avoid-page; page-break-inside: avoid; }
          .header, .page-header, .footer { break-inside: avoid-page; page-break-inside: avoid; }
          .section-title { break-after: avoid-page; page-break-after: avoid; }
          tr { break-inside: avoid-page; page-break-inside: avoid; }
          thead { display: table-header-group; }
        </style>
      </head>
      <body>

        <!-- Save hint (screen only) -->
        <div class="save-hint">
          <span class="save-hint-text">📄 Preview — 6-page A4 report. Save as PDF to keep the page breaks.</span>
          <button class="save-btn" onclick="window.print()">🖨️ Save as PDF</button>
        </div>

        <div class="page-wrapper">

          <!-- ============ PAGE 1 — Cover + Overview ============ -->
          <div class="page">
            <div class="header">
              <div class="header-left">
                <div class="header-badge">Analytics Report</div>
                <h1>CampusFind Lost &amp; Found Management System</h1>
                <p>Northwestern Samar State University · ISSC Office · Academic Year ${new Date().getFullYear()}</p>
              </div>
              <div class="header-right">
                <div>Generated on</div>
                <div style="font-weight:600;">${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <div style="opacity:0.7;">${new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            <div class="body">
              <div>
                <div class="narrative">${openingNarrative}</div>
                <div class="narrative" style="margin-top:8px;">${execSummary}</div>
              </div>

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

              <div>
                <div class="section-title">System Health</div>
                <div class="stats-grid">
                  <div class="stat-card">
                    <div class="stat-label">Claim Approval Rate</div>
                    <div class="stat-value">${claimsFunnel.approvalRate}%</div>
                    <div class="stat-sub">${claimsFunnel.approved} approved · ${claimsFunnel.rejected} rejected</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Avg. Trust Score</div>
                    <div class="stat-value">${avgTrustScore ?? '—'}</div>
                    <div class="stat-sub">${accountStatus.active} active students</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Tip Conversion</div>
                    <div class="stat-value">${tipsStats.rate}%</div>
                    <div class="stat-sub">${tipsStats.credited} of ${tipsStats.total} tips credited</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Deactivated Accounts</div>
                    <div class="stat-value">${accountStatus.deactivated}</div>
                    <div class="stat-sub">graduated/inactive</div>
                  </div>
                </div>
              </div>

              <div>
                <div class="section-title">Key Findings</div>
                <ul class="findings-list">
                  ${keyFindings.map((finding) => `<li>${finding}</li>`).join('')}
                </ul>
              </div>
            </div>

            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Page 1 of 6 · Confidential · ${new Date().getFullYear()}</div>
            </div>
          </div>

          <!-- ============ PAGE 2 — Claims, Trust & Resolution ============ -->
          <div class="page">
            <div class="page-header">
              <div>
                <div class="page-header-title">Claims, Trust &amp; Resolution</div>
                <div class="page-header-sub">How claims and trust activity are trending</div>
              </div>
              <div class="page-header-right">CampusFind Analytics Report<br/>${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="body">
              <div class="three-col">
                <div>
                  <div class="section-title">Claims by Status</div>
                  <div class="section-note">${claimsNote}</div>
                  <div class="bar-chart">
                    ${claimsRows.map((c) => `
                      <div class="bar-row">
                          <div class="bar-row-top">
                            <span class="bar-label">${c.status}</span>
                            <span class="bar-count">${c.count}</span>
                          </div>
                          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((c.count / Math.max(claimsFunnel.pending, claimsFunnel.approved, claimsFunnel.rejected, 1)) * 100)}%;background:${c.color};"></div></div>
                        </div>
                    `).join('')}
                  </div>
                </div>
                <div>
                  <div class="section-title">Trust Activity by Reason</div>
                  <div class="section-note">${trustReasonNote}</div>
                  <div class="bar-chart">
                    ${trustEventReasons.map((r) => `
                      <div class="bar-row">
                          <div class="bar-row-top">
                            <span class="bar-label">${r.name}</span>
                            <span class="bar-count">${r.value}</span>
                          </div>
                          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((r.value / maxReason) * 100)}%;background:#06433C;"></div></div>
                        </div>
                    `).join('')}
                  </div>
                </div>
                <div>
                  <div class="section-title">How Items Get Resolved</div>
                  <div class="section-note">${resolutionMethodNote}</div>
                  <div class="bar-chart">
                    ${resolutionMethodRows.length === 0
                      ? '<p style="font-size:10px;color:#9ca3af;">No resolved items yet.</p>'
                      : resolutionMethodRows.map((r) => `
                        <div class="bar-row">
                          <div class="bar-row-top">
                            <span class="bar-label">${r.name}</span>
                            <span class="bar-count">${r.value}</span>
                          </div>
                          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((r.value / totalResolvedViaKnown) * 100)}%;background:#0d8f82;"></div></div>
                        </div>
                      `).join('')}
                  </div>
                </div>
              </div>

              <div class="three-col" style="grid-template-columns: 1fr 1fr;">
                <div>
                  <div class="section-title">Student Trust Score Distribution</div>
                  <div class="section-note">${trustDistNote}</div>
                  <div class="bar-chart">
                    ${trustDistribution.length === 0
                      ? '<p style="font-size:10px;color:#9ca3af;">No trust score data yet.</p>'
                      : trustDistribution.map((t) => `
                        <div class="bar-row">
                          <div class="bar-row-top">
                            <span class="bar-label">${t.band}</span>
                            <span class="bar-count">${t.value}</span>
                          </div>
                          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((t.value / maxTrustBand) * 100)}%;background:#0a6b61;"></div></div>
                        </div>
                      `).join('')}
                  </div>
                </div>
                <div>
                  <div class="section-title">Lost Reports vs. ISSC Walk-in Drop-offs</div>
                  <div class="section-note">${reportTypeNote}</div>
                  <div class="bar-chart">
                    ${reportTypeData.length === 0
                      ? '<p style="font-size:10px;color:#9ca3af;">No data yet.</p>'
                      : reportTypeData.map((r, i) => `
                        <div class="bar-row">
                          <div class="bar-row-top">
                            <span class="bar-label">${r.name}</span>
                            <span class="bar-count">${r.value}</span>
                          </div>
                          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((r.value / totalReportType) * 100)}%;background:${i === 0 ? '#06433C' : '#2563eb'};"></div></div>
                        </div>
                      `).join('')}
                  </div>
                </div>
              </div>
            </div>

            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Page 2 of 6 · Confidential · ${new Date().getFullYear()}</div>
            </div>
          </div>

          <!-- ============ PAGE 3 — Trends & Categories ============ -->
          <div class="page">
            <div class="page-header">
              <div>
                <div class="page-header-title">Trends &amp; Categories</div>
                <div class="page-header-sub">Report volume over time, by category and location</div>
              </div>
              <div class="page-header-right">CampusFind Analytics Report<br/>${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="body">
              <div>
                <div class="section-title">Monthly Trend</div>
                  <div class="section-note">${trendNote}</div>
                ${trendData.length === 0
                  ? '<p style="font-size:10px;color:#9ca3af;">No data yet.</p>'
                  : `<div class="trend-chart">
                      ${trendData.map((t) => `
                        <div class="trend-bar-wrap">
                          <div class="trend-count">${t.count}</div>
                          <div class="trend-bar" style="height:${Math.round((t.count / maxTrend) * 90)}px;"></div>
                          <div class="trend-label">${t.month}</div>
                        </div>
                      `).join('')}
                    </div>`}
              </div>

              <div class="three-col" style="grid-template-columns: 1fr 1fr;">
                <div>
                  <div class="section-title">By Category</div>
                  <div class="section-note">${categoryNote}</div>
                  <div class="bar-chart">
                    ${categoryData.length === 0
                      ? '<p style="font-size:10px;color:#9ca3af;">No data yet.</p>'
                      : categoryData.slice(0, 7).map((c, i) => `
                        <div class="bar-row">
                          <div class="bar-row-top">
                            <span class="bar-label">${c.name}</span>
                            <span class="bar-count">${c.value}</span>
                          </div>
                          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((c.value / maxCategory) * 100)}%;background:${CATEGORY_COLORS[c.name] ?? COLORS[i % COLORS.length]};"></div></div>
                        </div>
                      `).join('')}
                  </div>
                </div>
                <div>
                  <div class="section-title">Top Locations</div>
                  <div class="section-note">${locationNote}</div>
                  <div class="bar-chart">
                    ${topLocations.length === 0
                      ? '<p style="font-size:10px;color:#9ca3af;">No data yet.</p>'
                      : topLocations.map((l, i) => `
                        <div class="bar-row">
                          <div class="bar-row-top">
                            <span class="bar-label">${i + 1}. ${l.location}</span>
                            <span class="bar-count">${l.count}</span>
                          </div>
                          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((l.count / maxLocation) * 100)}%;background:#0d8f82;"></div></div>
                        </div>
                      `).join('')}
                  </div>
                </div>
              </div>
            </div>

            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Page 3 of 6 · Confidential · ${new Date().getFullYear()}</div>
            </div>
          </div>

          <!-- ============ PAGE 4 — Student Accounts ============ -->
          <div class="page">
            <div class="page-header">
              <div>
                <div class="page-header-title">Student Accounts</div>
                <div class="page-header-sub">Who's registered, by department, program and year level</div>
              </div>
              <div class="page-header-right">CampusFind Analytics Report<br/>${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="body">
              <div>
                <div class="section-title">Students by Department</div>
                  <div class="section-note">${deptAccountsNote}</div>
                <div class="bar-chart">
                  ${accountsByDepartment.length === 0
                    ? '<p style="font-size:10px;color:#9ca3af;">No account data yet.</p>'
                    : accountsByDepartment.map((d) => `
                      <div class="bar-row">
                          <div class="bar-row-top">
                            <span class="bar-label">${d.name}</span>
                            <span class="bar-count">${d.value}</span>
                          </div>
                          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((d.value / maxDepartment) * 100)}%;background:#06433C;"></div></div>
                        </div>
                    `).join('')}
                </div>
              </div>

              <div>
                <div class="section-title">Students by Program/Course</div>
                  <div class="section-note">${programAccountsNote}</div>
                <div class="bar-chart">
                  ${accountsByProgram.length === 0
                    ? '<p style="font-size:10px;color:#9ca3af;">No account data yet.</p>'
                    : accountsByProgram.map((p) => `
                      <div class="bar-row">
                          <div class="bar-row-top">
                            <span class="bar-label">${p.name}</span>
                            <span class="bar-count">${p.value}</span>
                          </div>
                          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((p.value / maxProgram) * 100)}%;background:#0d8f82;"></div></div>
                        </div>
                    `).join('')}
                </div>
              </div>

              <div>
                <div class="section-title">Students by Year Level</div>
                  <div class="section-note">${yearAccountsNote}</div>
                <div class="bar-chart">
                  ${accountsByYear.length === 0
                    ? '<p style="font-size:10px;color:#9ca3af;">No account data yet.</p>'
                    : accountsByYear.map((y) => `
                      <div class="bar-row">
                          <div class="bar-row-top">
                            <span class="bar-label">${y.name}</span>
                            <span class="bar-count">${y.value}</span>
                          </div>
                          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((y.value / Math.max(...accountsByYear.map((x) => x.value), 1)) * 100)}%;background:#0a6b61;"></div></div>
                        </div>
                    `).join('')}
                </div>
              </div>
            </div>

            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Page 4 of 6 · Confidential · ${new Date().getFullYear()}</div>
            </div>
          </div>

          <!-- ============ PAGE 5 — Lost Items by Department & Program ============ -->
          <div class="page">
            <div class="page-header">
              <div>
                <div class="page-header-title">Lost Items by Department &amp; Program</div>
                <div class="page-header-sub">Which groups file the most lost reports, and how often per student</div>
              </div>
              <div class="page-header-right">CampusFind Analytics Report<br/>${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="body">
              <div>
                <div class="section-title">Which Departments Lose Items Most (per student)</div>
                <div class="section-note">Lost reports per student, not just raw count, so a bigger department doesn't look worse by headcount alone.</div>
                <table>
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Reports Filed</th>
                      <th>Students</th>
                      <th>Reports / Student</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${lostRateByDepartment.length === 0
                      ? '<tr><td colspan="4" style="color:#9ca3af;text-align:center;padding:14px;">No lost reports yet.</td></tr>'
                      : lostRateByDepartment.map((d) => `
                        <tr>
                          <td>${d.name}</td>
                          <td class="td-num">${d.value}</td>
                          <td>${d.students}</td>
                          <td class="td-num">${d.rate !== null ? d.rate.toFixed(2) : '—'}</td>
                        </tr>
                      `).join('')}
                  </tbody>
                </table>
              </div>

              <div>
                <div class="section-title">Lost Reports by Program</div>
                  <div class="section-note">${lostProgramNote}</div>
                <div class="bar-chart">
                  ${lostByProgram.length === 0
                    ? '<p style="font-size:10px;color:#9ca3af;">No lost reports yet.</p>'
                    : lostByProgram.map((p) => `
                      <div class="bar-row">
                          <div class="bar-row-top">
                            <span class="bar-label">${p.name}</span>
                            <span class="bar-count">${p.value}</span>
                          </div>
                          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((p.value / maxLostProgram) * 100)}%;background:#dc2626;"></div></div>
                        </div>
                    `).join('')}
                </div>
              </div>
            </div>

            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Page 5 of 6 · Confidential · ${new Date().getFullYear()}</div>
            </div>
          </div>

          <!-- ============ PAGE 6 — Monthly Report Log ============ -->
          <div class="page">
            <div class="page-header">
              <div>
                <div class="page-header-title">Monthly Report Log</div>
                <div class="page-header-sub">Full month-by-month breakdown of filed reports</div>
              </div>
              <div class="page-header-right">CampusFind Analytics Report<br/>${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="body">
              <div>
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
                      ? '<tr><td colspan="4" style="color:#9ca3af;text-align:center;padding:14px;">No data available.</td></tr>'
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

              <div>
                <div class="section-title">Recommendations</div>
                <ol class="recommend-list">
                  ${recommendations.map((rec) => `<li>${rec}</li>`).join('')}
                </ol>
              </div>

              <div>
                <div class="section-title">Conclusion</div>
                <div class="conclusion-box">
                  This report reflects CampusFind activity for ${periodLabel}. Overall, ${resolutionRate}% of reports were resolved
                  with a ${claimsFunnel.approvalRate}% claim approval rate. The findings and recommendations above are generated
                  directly from the current dataset and will update automatically as new reports, claims, and accounts are recorded.
                </div>
              </div>
            </div>

            <div class="footer">
              <div><strong>CampusFind</strong> · Lost &amp; Found Management System · NwSSU ISSC Office</div>
              <div>Page 6 of 6 · Confidential · ${new Date().getFullYear()}</div>
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
            <SkeletonBlock key={i} className="rounded-xl h-20" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <SkeletonBlock key={i} className="rounded-xl h-64" />
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

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Claim Approval Rate" value={`${claimsFunnel.approvalRate}%`} sub={`${claimsFunnel.approved} approved · ${claimsFunnel.rejected} rejected`} />
        <StatCard label="Avg Trust Score" value={avgTrustScore ?? '—'} sub={`${accountStatus.active} active students`} />
        <StatCard label="Tip Conversion" value={`${tipsStats.rate}%`} sub={`${tipsStats.credited} of ${tipsStats.total} tips credited`} />
        <StatCard label="Deactivated Accounts" value={accountStatus.deactivated} sub="graduated/inactive" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Claims by status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={[
                { status: 'Pending', count: claimsFunnel.pending },
                { status: 'Approved', count: claimsFunnel.approved },
                { status: 'Rejected', count: claimsFunnel.rejected },
              ]}
              margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="status" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar isAnimationActive={animateCharts} dataKey="count" fill="#0d8f82" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Student trust score distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie isAnimationActive={animateCharts} data={trustDistribution} cx="50%" cy="46%" outerRadius={70} dataKey="value" nameKey="band" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11} fontWeight={600}>
                {trustDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name, entry) => [value, entry.payload.band]} />
              <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8, lineHeight: '18px' }} formatter={(value, entry) => entry?.payload?.band ?? value} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Trust score activity by reason</h3>
          {trustEventReasons.every((r) => r.value === 0) ? (
            <p className="text-xs text-text-muted">No trust score activity yet.</p>
          ) : (
            <BarList data={trustEventReasons} barColor="#06433C" />
          )}
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">How items actually get resolved</h3>
          {resolvedViaData.length === 0 ? (
            <p className="text-xs text-text-muted">No resolved items yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie isAnimationActive={animateCharts} data={resolvedViaData} cx="50%" cy="46%" outerRadius={70} dataKey="value" nameKey="name" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11} fontWeight={600}>
                  {resolvedViaData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8, lineHeight: '18px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Lost reports vs. ISSC walk-in drop-offs</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie isAnimationActive={animateCharts} data={reportTypeData} cx="50%" cy="46%" outerRadius={70} dataKey="value" nameKey="name" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11} fontWeight={600}>
                {reportTypeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8, lineHeight: '18px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Students by year level</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={accountsByYear} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar isAnimationActive={animateCharts} dataKey="value" fill="#0a6b61" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Students by department</h3>
          {accountsByDepartment.length === 0 ? (
            <p className="text-xs text-text-muted">No account data yet.</p>
          ) : (
            <BarList data={accountsByDepartment} barColor="#06433C" />
          )}
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Students by program/course</h3>
          {accountsByProgram.length === 0 ? (
            <p className="text-xs text-text-muted">No account data yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {accountsByProgram.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-text-primary pr-2">{p.name}</p>
                      <p className="text-xs text-text-muted shrink-0 ml-2">{p.value}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${(p.value / (accountsByProgram[0]?.value ?? 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Which departments lose items most</h3>
          <p className="text-xs text-text-muted mb-4">Lost reports per student — not just raw count, so a bigger department doesn't look worse by headcount alone.</p>
          {lostByDepartment.length === 0 ? (
            <p className="text-xs text-text-muted">No lost reports yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lostByDepartment
                .map((d) => {
                  const students = accountsByDepartment.find((a) => a.name === d.name)?.value ?? 0
                  const rate = students > 0 ? d.value / students : null
                  return { ...d, students, rate }
                })
                .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))
                .map((d, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-text-primary">
                          {d.name}
                          {d.students > 0 && (
                            <span className="text-text-muted font-normal ml-1.5">
                              {d.rate.toFixed(2)} reports/student
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-text-muted shrink-0 ml-2">{d.value} reports · {d.students} students</p>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-status-rejected-text"
                          style={{
                            width: `${Math.min(((d.rate ?? 0) / Math.max(...lostByDepartment.map((x) => {
                              const s = accountsByDepartment.find((a) => a.name === x.name)?.value ?? 0
                              return s > 0 ? x.value / s : 0
                            }), 0.01)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Lost reports by program/course</h3>
          {lostByProgram.length === 0 ? (
            <p className="text-xs text-text-muted">No lost reports yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lostByProgram.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-text-primary pr-2">{p.name}</p>
                      <p className="text-xs text-text-muted shrink-0 ml-2">{p.value}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div className="h-full rounded-full bg-status-rejected-text" style={{ width: `${(p.value / (lostByProgram[0]?.value ?? 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
              <Line isAnimationActive={animateCharts} type="monotone" dataKey="count" stroke="#06433C" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Reports by category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie isAnimationActive={animateCharts} data={categoryData} cx="50%" cy="44%" outerRadius={75} dataKey="value" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11} fontWeight={600}>
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] ?? COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8, lineHeight: '18px' }} />
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
              <Bar isAnimationActive={animateCharts} dataKey="count" fill="#06433C" radius={[4, 4, 0, 0]} />
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
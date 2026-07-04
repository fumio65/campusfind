import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

const router = Router()

// GET /accounts?limit=50&offset=0&search=juan
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200)
  const offset = parseInt(req.query.offset) || 0
  const search = (req.query.search ?? '').trim()

  let query = supabaseAdmin
    .from('users')
    .select(
      'id, student_id, enrollment_number, first_name, last_name, middle_name, program, year_level, role, status, trust_score, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.or(
      `student_id.ilike.${search}%,last_name.ilike.${search}%,first_name.ilike.${search}%`
    )
  }

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })

  res.json({
    accounts: data.map((u) => ({
      id: u.id,
      student_id: u.student_id,
      enrollment_number: u.enrollment_number,
      name: `${u.first_name} ${u.last_name}`,
      first_name: u.first_name,
      last_name: u.last_name,
      middle_name: u.middle_name,
      program: u.program,
      year_level: u.year_level,
      role: u.role,
      status: u.status,
      trust_score: u.trust_score,
      created_at: u.created_at,
    })),
    total: count,
    limit,
    offset,
  })
})

// POST /accounts/single
router.post('/single', async (req, res) => {
  const { studentId, enrollmentNumber, lastName, firstName } = req.body

  if (!studentId || !enrollmentNumber || !lastName || !firstName) {
    return res.status(400).json({
      error: 'studentId, enrollmentNumber, lastName, and firstName are all required.',
    })
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .insert({
      student_id: studentId,
      enrollment_number: enrollmentNumber,
      last_name: lastName,
      first_name: firstName,
      role: 'student',
      status: 'active',
      force_password_change: true,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PATCH /accounts/:id/status — deactivate or reactivate a single account
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params
  const { status } = req.body

  if (status !== 'active' && status !== 'deactivated') {
    return res.status(400).json({ error: 'status must be "active" or "deactivated".' })
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ status })
    .eq('id', id)
    .select('id, student_id, status')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
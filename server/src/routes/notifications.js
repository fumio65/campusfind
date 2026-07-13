import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

const router = Router()

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.patch('/read-all', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ read: true })
    .eq('read', false)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

router.patch('/:id/read', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ read: true })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/', async (req, res) => {
  const { type, title, body, report_id, claim_id } = req.body
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert({ type, title, body, report_id, claim_id })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

export default router
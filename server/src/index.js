import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import bulkImportRouter from './routes/bulkImport.js'
import accountsRouter from './routes/accounts.js'
import overviewRouter from './routes/overview.js'
import analyticsRouter from './routes/analytics.js'

const app = express()
const PORT = process.env.PORT || 3001

const allowedOrigins = (process.env.ADMIN_ORIGIN || 'http://localhost:5173').split(',')
app.use(cors({ origin: allowedOrigins }))
app.use(express.json())

app.get('/health', (req, res) => res.json({ ok: true }))

app.use('/overview', overviewRouter)
app.use('/analytics', analyticsRouter)
app.use('/accounts', accountsRouter)
app.use('/accounts', bulkImportRouter)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Unexpected server error.' })
})

app.listen(PORT, () => {
  console.log(`CampusFind server listening on http://localhost:${PORT}`)
})
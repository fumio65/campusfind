import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import bulkImportRouter from './routes/bulkImport.js'
import accountsRouter from './routes/accounts.js'
import overviewRouter from './routes/overview.js'
import analyticsRouter from './routes/analytics.js'
import reportsRouter from './routes/reports.js'
import notificationsRouter from './routes/notifications.js'
import proxyRouter from './routes/proxy.js'
import confirmationRouter from './routes/confirmation.js'
import claimsRouter from './routes/claims.js'
import tipsRouter from './routes/tips.js'

const app = express()
const PORT = process.env.PORT || 3001

const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174']
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}))
app.use(express.json())

app.get('/health', (req, res) => res.json({ ok: true }))

app.use('/overview', overviewRouter)
app.use('/analytics', analyticsRouter)
app.use('/reports', reportsRouter)
app.use('/notifications', notificationsRouter)
app.use('/proxy', proxyRouter)
app.use('/confirmation', confirmationRouter)
app.use('/claims', claimsRouter)
app.use('/accounts', accountsRouter)
app.use('/accounts', bulkImportRouter)
app.use('/tips', tipsRouter)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Unexpected server error.' })
})

app.listen(PORT, () => {
  console.log(`CampusFind server listening on http://localhost:${PORT}`)
})
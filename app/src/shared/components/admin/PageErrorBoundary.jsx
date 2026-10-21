import { Component } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

// Catches a crash inside one admin page so it shows a message with a retry
// button instead of unmounting the whole dashboard to a blank white screen.
// AdminAppShell keys it by route, so moving to another tab also resets it.
export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[admin] page crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-status-rejected-bg flex items-center justify-center">
          <AlertCircle size={22} className="text-status-rejected-text" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary mb-1">This page couldn't load</p>
          <p className="text-xs text-text-muted">Something went wrong while showing it. Your data is safe.</p>
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border-strong text-xs font-semibold text-text-secondary hover:bg-surface-muted transition-colors"
        >
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    )
  }
}

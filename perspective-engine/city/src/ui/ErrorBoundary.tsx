import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Which part of the page this guards, for the console. */
  name: string
  children: ReactNode
  /** Shown while the guarded part is down. */
  fallback?: ReactNode
  /** Called once per failure, e.g. to move the focus somewhere safe. */
  onError?: (error: Error) => void
  /** Changing this retries the children (for example after the focus was reset). */
  resetKey?: string
}
interface State { failed: boolean; key: string | undefined }

/** Keeps one broken view from unmounting the whole page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, key: this.props.resetKey }

  // The key is remembered from the render that failed, so only a later change of key retries.
  static getDerivedStateFromProps(p: Props, s: State): Partial<State> | null {
    if (p.resetKey === s.key) return null
    return s.failed ? { failed: false, key: p.resetKey } : { key: p.resetKey }
  }

  static getDerivedStateFromError(): Partial<State> { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}]`, error, info.componentStack)
    this.props.onError?.(error)
  }

  render() { return this.state.failed ? this.props.fallback ?? null : this.props.children }
}

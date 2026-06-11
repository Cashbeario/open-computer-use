import React from 'react'
import { useAuthStore } from '../stores/auth-store'

type AuthView = 'sign-in' | 'sign-up' | 'magic-link' | 'forgot-password'

export function AuthScreen() {
  const {
    signIn, signInWithEmail, signUpWithEmail, signInWithMagicLink,
    resetPassword, cancelAuth, waitingForEmail,
  } = useAuthStore()
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)
  const [authView, setAuthView] = React.useState<AuthView>('sign-in')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const cancelledRef = React.useRef(false)

  function switchView(view: AuthView) {
    setAuthView(view)
    setError(null)
    setSuccess(null)
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    const ok = await signIn()
    setSubmitting(false)
    if (!ok) setError('Sign in failed. Please try again.')
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Please fill in all fields'); return }
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    const result = await signInWithEmail(email, password)
    setSubmitting(false)
    if (!result.success) {
      if (result.error?.includes('Email not confirmed')) {
        setError('Confirm your email first. Check your inbox.')
      } else if (result.error?.includes('Invalid login credentials')) {
        setError('Invalid email or password.')
      } else {
        setError(result.error || 'Sign in failed.')
      }
    }
  }

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || !confirmPassword) { setError('Please fill in all fields'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    const result = await signUpWithEmail(email, password)
    setSubmitting(false)
    if (!result.success) {
      if (result.error?.includes('timed out')) {
        setError('Timed out. You can sign in after confirming.')
        switchView('sign-in')
      } else {
        setError(result.error || 'Sign up failed.')
      }
    }
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setError('Please enter your email'); return }
    cancelledRef.current = false
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    const result = await signInWithMagicLink(email)
    setSubmitting(false)
    if (cancelledRef.current) return
    if (!result.success) {
      if (result.error?.includes('Signups not allowed for otp')) {
        setAuthView('sign-up')
        setError('No account found. Please sign up first.')
      } else if (result.error?.includes('timed out')) {
        setError('Timed out. Please try again.')
      } else {
        setError(result.error || 'Failed to send magic link.')
      }
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setError('Please enter your email'); return }
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    const result = await resetPassword(email)
    setSubmitting(false)
    if (result.success) {
      setSuccess('Check your email for the reset link.')
    } else {
      setError(result.error || 'Failed to send reset email.')
    }
  }

  const handleCancel = async () => {
    const wasMagicLink = authView === 'magic-link'
    cancelledRef.current = true
    await cancelAuth()
    setSuccess(null)
    if (wasMagicLink) {
      setAuthView('sign-up')
      setError('No email received? You may need to sign up first.')
    } else {
      setError(null)
    }
  }

  const inputClass = 'w-full px-3 py-1.5 bg-neutral-800/60 border border-neutral-700/50 rounded-lg text-[13px] text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 transition-colors'
  const btnPrimary = 'w-full flex items-center justify-center gap-2.5 px-4 py-2 bg-white text-neutral-900 rounded-lg font-medium text-[13px] hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'

  const titleBar = (
    <div className="titlebar-drag flex items-center justify-between px-4 py-1.5 flex-shrink-0">
      <span className="text-[11px] text-neutral-600 font-medium">Coasty Desktop</span>
      <div className="titlebar-no-drag flex items-center gap-1">
        <button onClick={() => window.close()} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors" title="Close">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    </div>
  )

  const logoSvg = (size: string) => (
    <svg className={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="authLogo" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" stopOpacity={0} />
          <stop offset="30%" stopColor="rgba(255,255,255,0.1)" stopOpacity={1} />
          <stop offset="50%" stopColor="rgba(255,255,255,0.3)" stopOpacity={1} />
          <stop offset="70%" stopColor="rgba(255,255,255,0.6)" stopOpacity={1} />
          <stop offset="100%" stopColor="rgba(255,255,255,1)" stopOpacity={1} />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#authLogo)" />
    </svg>
  )

  // ── Waiting for email confirmation / magic link ──────────────────────
  if (waitingForEmail) {
    return (
      <div className="flex flex-col h-screen bg-neutral-950 rounded-xl overflow-hidden">
        {titleBar}
        <div className="flex flex-col items-center justify-center flex-1 px-8">
          <div className="w-full max-w-sm space-y-5 text-center">
            {logoSvg('w-12 h-12 mx-auto')}
            <div>
              <h1 className="text-lg font-semibold text-white">Check your email</h1>
              <p className="mt-2 text-neutral-400 text-[13px] leading-relaxed">
                We sent {authView === 'sign-up' ? 'a confirmation link' : 'a magic link'} to <span className="text-white font-medium">{email}</span>. Click the link to continue.
              </p>
            </div>
            <div className="flex justify-center">
              <svg className="animate-spin h-5 w-5 text-neutral-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <button onClick={handleCancel} className="text-neutral-500 hover:text-neutral-300 text-[13px] transition-colors">
              Cancel
            </button>
            {authView === 'magic-link' && (
              <p className="text-neutral-500 text-[11px] mt-2">
                Don't have an account?{' '}
                <button
                  onClick={async () => {
                    cancelledRef.current = true
                    await cancelAuth()
                    setAuthView('sign-up')
                    setError('No account found with this email. Please sign up to create one.')
                  }}
                  className="text-white hover:underline"
                >
                  Sign up
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Main auth screen ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-neutral-950 rounded-xl overflow-hidden">
      {titleBar}

      {/* Content — vertically centered */}
      <div className="flex flex-col items-center justify-center flex-1 px-7">
        <div className="w-full max-w-sm space-y-4 text-center">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            {logoSvg('w-12 h-12')}
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Coasty</h1>
              <p className="mt-1 text-neutral-400 text-[13px]">Your computer, autopiloted.</p>
            </div>
          </div>

          {/* Card */}
          <div className="bg-neutral-900/80 border border-neutral-800/60 rounded-xl p-4 space-y-3 text-left">
            {error && <p className="text-red-400 text-[11px] bg-red-500/10 rounded-lg px-2.5 py-1.5">{error}</p>}
            {success && <p className="text-emerald-400 text-[11px] bg-emerald-500/10 rounded-lg px-2.5 py-1.5">{success}</p>}

            {/* Google */}
            <button onClick={handleGoogleSignIn} disabled={submitting} className={btnPrimary}>
              {submitting && authView === 'sign-in' && !email ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              {submitting && authView === 'sign-in' && !email ? 'Signing in...' : 'Continue with Google'}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-neutral-800" />
              <span className="text-[10px] text-neutral-500">or</span>
              <div className="h-px flex-1 bg-neutral-800" />
            </div>

            {/* Sign In */}
            {authView === 'sign-in' && (
              <form onSubmit={handleEmailSignIn} className="space-y-2.5">
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} autoComplete="email" className={inputClass} />
                <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} autoComplete="current-password" className={inputClass} />
                <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? 'Signing in...' : 'Sign in'}</button>
                <div className="flex items-center justify-between text-[11px]">
                  <button type="button" onClick={() => switchView('forgot-password')} className="text-neutral-500 hover:text-neutral-300 transition-colors">Forgot password?</button>
                  <button type="button" onClick={() => switchView('magic-link')} className="text-neutral-500 hover:text-neutral-300 transition-colors">Magic link</button>
                </div>
                <p className="text-center text-[11px] text-neutral-500">No account?{' '}<button type="button" onClick={() => switchView('sign-up')} className="text-white hover:underline">Sign up</button></p>
              </form>
            )}

            {/* Sign Up */}
            {authView === 'sign-up' && (
              <form onSubmit={handleEmailSignUp} className="space-y-2.5">
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} autoComplete="email" className={inputClass} />
                <input type="password" placeholder="Password (min. 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} autoComplete="new-password" className={inputClass} />
                <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={submitting} autoComplete="new-password" className={inputClass} />
                <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? 'Creating account...' : 'Create account'}</button>
                <p className="text-center text-[11px] text-neutral-500">Have an account?{' '}<button type="button" onClick={() => switchView('sign-in')} className="text-white hover:underline">Sign in</button></p>
              </form>
            )}

            {/* Magic Link */}
            {authView === 'magic-link' && (
              <form onSubmit={handleMagicLink} className="space-y-2.5">
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} autoComplete="email" className={inputClass} />
                <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? 'Sending...' : 'Send magic link'}</button>
                <p className="text-center text-[11px] text-neutral-500"><button type="button" onClick={() => switchView('sign-in')} className="text-white hover:underline">Back to sign in</button></p>
              </form>
            )}

            {/* Forgot Password */}
            {authView === 'forgot-password' && (
              <form onSubmit={handleForgotPassword} className="space-y-2.5">
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} autoComplete="email" className={inputClass} />
                <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? 'Sending...' : 'Send reset link'}</button>
                <p className="text-center text-[11px] text-neutral-500"><button type="button" onClick={() => switchView('sign-in')} className="text-white hover:underline">Back to sign in</button></p>
              </form>
            )}
          </div>

          <p className="text-neutral-600 text-[10px] leading-relaxed">
            By continuing, you agree to let Coasty automate tasks on this machine and accept our{' '}
            <button
              type="button"
              onClick={() => window.coasty.openExternal('https://coasty.ai/terms')}
              className="text-neutral-400 underline underline-offset-2 hover:text-neutral-200 transition-colors"
            >
              Terms
            </button>{' '}
            and{' '}
            <button
              type="button"
              onClick={() => window.coasty.openExternal('https://coasty.ai/privacy')}
              className="text-neutral-400 underline underline-offset-2 hover:text-neutral-200 transition-colors"
            >
              Privacy Policy
            </button>.
          </p>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Shield, Eye, EyeOff, Lock, User } from 'lucide-react'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const form = new URLSearchParams()
      form.append('username', username)
      form.append('password', password)

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Login failed')

      localStorage.setItem('sd_token', data.access_token)
      localStorage.setItem('sd_admin_name', data.name)
      onLogin(data.access_token, data.name)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-sentinel-bg flex items-center justify-center p-4">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'linear-gradient(#00d4ff 1px, transparent 1px), linear-gradient(90deg, #00d4ff 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sentinel-accent/10 border border-sentinel-accent/30 mb-4 glow-accent">
            <Shield size={32} className="text-sentinel-accent" />
          </div>
          <h1 className="text-2xl font-bold tracking-widest text-white uppercase">SentinelDrive</h1>
          <p className="text-xs text-gray-500 tracking-widest mt-1 uppercase">Admin Command Center</p>
        </div>

        {/* Card */}
        <div className="bg-sentinel-card border border-sentinel-border rounded-2xl p-8 scanline">
          <p className="text-sm text-gray-400 mb-6 text-center">
            Restricted access — authorized personnel only
          </p>

          <form onSubmit={submit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1.5">Username</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  className="w-full bg-sentinel-bg border border-sentinel-border rounded-lg pl-9 pr-4 py-2.5
                    text-sm text-white placeholder-gray-600 focus:border-sentinel-accent focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1.5">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  required
                  className="w-full bg-sentinel-bg border border-sentinel-border rounded-lg pl-9 pr-10 py-2.5
                    text-sm text-white placeholder-gray-600 focus:border-sentinel-accent focus:outline-none transition-colors"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-sentinel-red bg-sentinel-red/10 border border-sentinel-red/30 rounded px-3 py-2">
                ⚠ {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-sentinel-accent/10 border border-sentinel-accent
                text-sentinel-accent font-semibold text-sm tracking-wider hover:bg-sentinel-accent/20
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Authenticating...' : 'Access Command Center'}
            </button>
          </form>

          <p className="text-xs text-gray-600 text-center mt-6">
            Default: admin / sentinel@2024
          </p>
        </div>
      </div>
    </div>
  )
}

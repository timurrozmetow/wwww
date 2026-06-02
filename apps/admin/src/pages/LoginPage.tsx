import { type FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { adminApi } from '../api/admin';
import { AdminApiError } from '../api/client';
import { useAuthStore } from '../store/auth';

export function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => adminApi.login(email, password),
    onSuccess: (res) => setAuth(res.token, res.admin),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  const errorMessage =
    login.error instanceof AdminApiError
      ? login.error.message
      : login.isError
        ? 'Login failed'
        : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl"
      >
        <h1 className="mb-1 text-xl font-semibold text-slate-100">VPN Admin</h1>
        <p className="mb-6 text-sm text-slate-400">Sign in to the control panel</p>

        <label className="mb-1 block text-sm text-slate-300">Email</label>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
        />

        <label className="mb-1 block text-sm text-slate-300">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
        />

        {errorMessage ? <p className="mb-4 text-sm text-red-400">{errorMessage}</p> : null}

        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

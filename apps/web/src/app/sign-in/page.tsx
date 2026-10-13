'use client';

import { createAuthClient } from '@neondatabase/auth/next';
import { type FormEvent, useState } from 'react';

// Client không nhận tham số: nó nói chuyện với proxy cùng gốc ở /api/auth/[...all]
// (skill neon-auth, mục "Next.js"). Chỉ có đăng nhập vì plan chốt đăng ký đóng.
const authClient = createAuthClient();

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const { error: signInError } = await authClient.signIn.email({ email, password });

    if (signInError) {
      setError('Không đăng nhập được. Kiểm lại email và mật khẩu.');
      setPending(false);
      return;
    }

    // Tải lại để proxy đọc cookie phiên mới thay vì điều hướng phía client.
    window.location.assign('/');
  }

  return (
    <main>
      <h1>Đăng nhập</h1>
      <p>Research Hub dùng một tài khoản chủ. Đăng ký mới đã đóng.</p>
      <form onSubmit={onSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">Mật khẩu</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button type="submit" disabled={pending}>
          {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}

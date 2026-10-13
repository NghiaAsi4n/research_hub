import { describe, expect, it } from 'vitest';
import { isSignUpRequest } from './auth';

// Ranh giới 6 của plan: đăng ký đóng, chỉ tài khoản chủ tồn tại.
describe('isSignUpRequest', () => {
  it('chặn các đường dẫn đăng ký', () => {
    expect(isSignUpRequest('/sign-up')).toBe(true);
    expect(isSignUpRequest('/signup')).toBe(true);
    expect(isSignUpRequest('/register')).toBe(true);
    expect(isSignUpRequest('/SIGN-UP')).toBe(true);
  });

  it('chặn cả đường dẫn con của luồng đăng ký', () => {
    expect(isSignUpRequest('/sign-up/verify')).toBe(true);
    expect(isSignUpRequest('/register/step-2')).toBe(true);
  });

  it('không chặn các đường dẫn khác', () => {
    expect(isSignUpRequest('/sign-in')).toBe(false);
    expect(isSignUpRequest('/api/auth/get-session')).toBe(false);
    expect(isSignUpRequest('/')).toBe(false);
  });
});

// Phần auth không phụ thuộc framework nằm ở core; instance Neon Auth thật được dựng
// trong apps/web vì API nằm ở entrypoint Next của package.
//
// Đóng đăng ký (plan mục 2 và ranh giới 6): chỉ tài khoản chủ tồn tại.
export const SIGN_UP_PATH_PATTERNS = ['/sign-up', '/signup', '/register'] as const;

export function isSignUpRequest(pathname: string): boolean {
  const normalized = pathname.toLowerCase();
  return SIGN_UP_PATH_PATTERNS.some(
    (pattern) => normalized === pattern || normalized.startsWith(`${pattern}/`),
  );
}

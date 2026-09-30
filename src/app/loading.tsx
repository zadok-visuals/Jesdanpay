// Root-level Suspense fallback — Next.js streams this immediately for any route with no more
// specific loading.tsx of its own (this mainly covers "/", /login, /signup, /forgot-password,
// /reset-password, /auth/* — every (dashboard)/* and admin/* route already has its own). Plain
// server component, zero JS, so it paints the instant the shell can stream rather than leaving
// the browser showing nothing (or its own dark default) while the page's async work resolves.
export default function RootLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
    </div>
  );
}

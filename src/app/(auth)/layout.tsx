import { Wordmark } from "@/components/layout/Wordmark";
import { PersonWithPhoneIllustration } from "@/components/layout/PersonWithPhoneIllustration";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-primary-600 to-primary-800 p-10 md:flex md:w-[42%] lg:w-2/5">
        <div className="w-fit rounded-2xl bg-white p-3">
          <Wordmark />
        </div>

        <PersonWithPhoneIllustration className="mx-auto h-auto w-full max-w-[280px]" />

        <div>
          <p className="max-w-xs text-3xl font-bold leading-tight text-white">
            Move money between Nigeria and China with ease.
          </p>
          <p className="mt-4 text-sm text-white/60">© {new Date().getFullYear()} JesDanPay</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-12">
        <div className="mb-8 md:hidden">
          <Wordmark />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

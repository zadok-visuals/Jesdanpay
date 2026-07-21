import Image from "next/image";
import { Wordmark } from "@/components/layout/Wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-col bg-gradient-to-br from-primary-600 to-primary-800 md:flex md:w-[42%] lg:w-2/5">
        <div className="p-10 pb-0">
          <div className="w-fit rounded-2xl bg-white p-3">
            <Wordmark />
          </div>
        </div>

        <div className="p-10 pt-10">
          <p className="max-w-xs text-3xl font-bold leading-tight text-white">
            Move money between Nigeria and China with ease.
          </p>
          <p className="mt-4 text-sm text-white/60">© {new Date().getFullYear()} JesDanPay</p>
        </div>

        <div className="flex flex-1 items-center overflow-hidden px-3 py-4">
          <div className="mx-auto w-full overflow-hidden rounded-2xl bg-white">
            <Image
              src="/auth-hero.png"
              alt="Smiling JesDanPay user holding up the app on their phone"
              width={1124}
              height={1399}
              className="h-auto max-h-[60vh] w-full object-cover"
              priority
            />
          </div>
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

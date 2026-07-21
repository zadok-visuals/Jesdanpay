import Image from "next/image";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/jesdanpay-logo.png"
      alt="JesDanPay"
      width={897}
      height={215}
      priority
      className={`h-8 w-auto ${className}`}
    />
  );
}

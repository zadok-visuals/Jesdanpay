export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`text-2xl font-bold tracking-tight ${className}`}>
      <span className="text-primary-500">Jesdan</span>
      <span className="text-accent-500">Pay</span>
    </span>
  );
}

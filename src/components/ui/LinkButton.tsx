"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { Button, type ButtonProps } from "@/components/ui/Button";

// useLinkStatus must be read from a component that's a DESCENDANT of the Link it's tracking —
// this is that descendant. Feeds the exact same Button `loading` prop (spinner + disabled) every
// form-submit button in the app already uses, so a navigation-triggered action looks identical to
// a server-action-triggered one instead of introducing a second, different "pending" visual
// language.
function StatusButton(props: ButtonProps) {
  const { pending } = useLinkStatus();
  return <Button loading={pending} {...props} />;
}

export function LinkButton({
  href,
  className,
  ...buttonProps
}: { href: string; className?: string } & ButtonProps) {
  return (
    <Link href={href} className={className}>
      <StatusButton {...buttonProps} />
    </Link>
  );
}

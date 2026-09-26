import { LinkButton } from "@/components/ui/LinkButton";

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2 11 13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WithdrawIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 4v13M7 17l-3-3M7 17l3-3M17 20V7M17 7l-3 3M17 7l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Overrides size="lg"'s default px-6/text-base — kept compact at every viewport width rather
// than growing at a breakpoint (confirmed live: growing at sm: overflowed the balance card well
// into ordinary 1366px laptop widths, four buttons plus the balance figure don't fit next to a
// 256px sidebar at that size). Uses grid (not flex) for the same reason AccountsView.tsx already
// does — a flex-1 item with nowrap text has an implicit min-width equal to its content, so it
// overflows past the row instead of shrinking; a minmax(0,1fr) grid column actually constrains
// it, letting the label wrap as a last resort at genuinely tight widths instead of clipping.
const ACTION_BUTTON_CLASSES = "w-full !gap-1 !px-1.5 !text-[11px]";

// All four actions, in order, as direct children of TotalBalanceCard's single 2x2 grid — no grid
// wrapper of their own here, so buttons never end up nested inside two separate 2-column grids
// sitting side by side. Add Money / Send to China stay filled/primary weight (the two most common
// things a user does); Withdraw / Convert stay "secondary" (bordered, unfilled) so they read as
// subordinate without dropping to a different button system entirely.
export function QuickActions() {
  return (
    <>
      <LinkButton href="/accounts" size="lg" className={ACTION_BUTTON_CLASSES}>
        <PlusIcon />
        Add Money
      </LinkButton>
      <LinkButton href="/pay-to-china" variant="secondary" size="lg" className={ACTION_BUTTON_CLASSES}>
        <SendIcon />
        Send to China
      </LinkButton>
      <LinkButton href="/accounts" variant="secondary" size="lg" className={ACTION_BUTTON_CLASSES}>
        <WithdrawIcon />
        Withdraw
      </LinkButton>
      <LinkButton href="/payments" variant="secondary" size="lg" className={ACTION_BUTTON_CLASSES}>
        <SwapIcon />
        Convert
      </LinkButton>
    </>
  );
}

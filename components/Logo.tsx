import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-emerald-700 text-sm text-white">
        ↻
      </span>
      LendLoop
    </Link>
  );
}

import { forwardRef, type ComponentProps } from "react";

import { cn } from "@/lib/utils";

const DateInput = forwardRef<HTMLInputElement, Omit<ComponentProps<"input">, "type">>(
  function DateInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        type="date"
        className={cn(
          "h-11 w-full rounded-none border-2 border-ink bg-surface px-3 font-mono text-sm shadow-[2px_2px_0_0_#111111] outline-none transition-shadow [color-scheme:light] focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);

export { DateInput };

import * as React from "react";
import { cn } from "@/lib/utils";

// Native checkbox, styled. Radix is in package.json but has no wrapper here
// and a native control is the right call for a one-thumb approval list.
export type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      className={cn(
        "h-5 w-5 shrink-0 cursor-pointer rounded border-input accent-primary",
        className
      )}
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };

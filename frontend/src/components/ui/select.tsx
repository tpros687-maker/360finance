import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "flex h-10 w-full appearance-none rounded-md border border-agro-accent/30 bg-white px-3 py-2 pr-8 text-sm text-agro-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agro-primary/20 focus-visible:border-agro-primary disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-agro-muted" />
    </div>
  )
);
Select.displayName = "Select";

export { Select };

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  upflowControlBaseClassName,
  upflowControlDefaultSizeClassName,
} from "@/components/ui/control-standards";

export const createActionButtonClassName = cn(
  upflowControlBaseClassName,
  upflowControlDefaultSizeClassName,
  "upflow-gradient-button shrink-0 border border-blue-300/20 text-white hover:brightness-105",
);

export const CreateActionButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(createActionButtonClassName, className)}
    {...props}
  />
));

CreateActionButton.displayName = "CreateActionButton";

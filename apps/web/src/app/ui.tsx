import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet";

/** Small local primitives following shadcn/ui's copy-owned, composable model. */
export function Button({
  variant = "primary",
  size = "default",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "default" | "small";
}) {
  return <button type={type} className={`button button-${variant}${size === "small" ? " button-small" : ""} ${className}`.trim()} {...props} />;
}

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`panel ${className}`.trim()} {...props} />;
}

export function Badge({
  variant = "neutral",
  className = "",
  children,
}: {
  variant?: "neutral" | "info" | "success" | "warning" | "danger";
  className?: string;
  children: ReactNode;
}) {
  return <span className={`badge badge-${variant} ${className}`.trim()}>{children}</span>;
}

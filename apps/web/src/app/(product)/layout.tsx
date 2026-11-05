import { ProductShell } from "../product-shell";

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ProductShell>{children}</ProductShell>;
}

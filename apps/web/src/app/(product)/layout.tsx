import { ProductShell } from "../product-shell";
import { WalletProvider } from "../wallet-context";

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <WalletProvider>
      <ProductShell>{children}</ProductShell>
    </WalletProvider>
  );
}

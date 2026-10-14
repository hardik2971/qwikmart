import { PanelShell } from '@/components/shell/PanelShell';

export default function Layout({ children }: { children: React.ReactNode }) { return <PanelShell panel="admin">{children}</PanelShell>; }

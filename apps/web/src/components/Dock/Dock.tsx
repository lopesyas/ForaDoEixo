import type { ReactNode } from 'react';
import { HumanHelp } from '../HumanHelp/HumanHelp';

/** Rodapé fixo: ações da tela (se houver) e a saída de emergência "Falar com atendente", sempre juntas. */
export function Dock({ children }: { children?: ReactNode }) {
  return (
    <div className="dock">
      {children}
      <HumanHelp />
    </div>
  );
}

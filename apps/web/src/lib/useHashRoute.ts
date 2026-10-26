import { useCallback, useEffect, useState } from 'react';

/** Rota por hash: o botão "voltar" do navegador funciona e cada tela tem endereço próprio. */
export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const [rawPath = '', rawQuery = ''] = hash.replace(/^#/, '').split('?');
  const path = rawPath || '/';
  const params = new URLSearchParams(rawQuery);

  const navigate = useCallback((to: string) => {
    window.location.hash = to;
  }, []);

  return { path, params, navigate };
}

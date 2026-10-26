import { configure } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// jsdom não implementa rolagem; o app rola ao topo ao trocar de tela.
window.scrollTo = () => {};

// A loja é uma página grande: consultas por papel (role) levam mais de 1 s no jsdom.
configure({ asyncUtilTimeout: 5000 });

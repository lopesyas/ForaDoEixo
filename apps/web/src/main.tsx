import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './App';
import { AssistantProvider } from './assistant/AssistantProvider';
import { CartProvider } from './cart/CartProvider';
import './styles/store.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CartProvider>
      <AssistantProvider>
        <App />
      </AssistantProvider>
    </CartProvider>
  </React.StrictMode>,
);

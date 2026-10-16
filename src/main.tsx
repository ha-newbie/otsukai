import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { consumePageHandoff, currentAppUrl } from './services/import-handoff';
import './ui/styles.css';

const initialHandoff = consumePageHandoff(window.location, window.history, currentAppUrl());
createRoot(document.getElementById('root')!).render(<StrictMode><App initialHandoff={initialHandoff} /></StrictMode>);

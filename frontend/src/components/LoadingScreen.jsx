import React from 'react';
import TerminalLoaderBackdrop from './TerminalLoaderBackdrop.jsx';

/** Standalone splash for optional use (manual lazy routes, modals). */
export default function LoadingScreen() {
  return <TerminalLoaderBackdrop variant="splash" detail="Initializing market terminal…" />;
}

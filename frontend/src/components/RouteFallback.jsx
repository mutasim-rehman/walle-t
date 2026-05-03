import React from 'react';
import TerminalLoaderBackdrop from './TerminalLoaderBackdrop.jsx';

export default function RouteFallback() {
  return (
    <TerminalLoaderBackdrop
      variant="compact"
      primary="Fetching interface"
      detail="Loading scripts and layouts…"
    />
  );
}

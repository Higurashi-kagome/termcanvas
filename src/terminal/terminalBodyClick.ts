export interface TerminalBodyClickOptions {
  isOverviewMode: boolean;
  hasComposerAdapter: boolean;
  composerEnabled: boolean;
  panToTerminalOnClick: boolean;
  focusOverviewTerminal: () => void;
  panToTerminal: () => void;
  focusXterm: () => void;
  focusComposer: () => void;
}

export function handleTerminalBodyClick(
  options: TerminalBodyClickOptions,
): void {
  if (options.isOverviewMode) {
    options.focusOverviewTerminal();
    return;
  }

  if (options.panToTerminalOnClick) {
    options.panToTerminal();
  }

  if (!options.hasComposerAdapter || !options.composerEnabled) {
    options.focusXterm();
    return;
  }

  options.focusComposer();
}

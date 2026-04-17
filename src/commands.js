// Predefined commands for the palette. This is the "prepare, don't implement"
// part of the spec: the wiring is done, add your own entries here.
//
// Each command: { id, title, keybinding?, group?, run() }.
// The `run` callback can be async; return values are ignored.

export function registerDefaultCommands(palette, tabs, { openSshMenu } = {}) {
  if (openSshMenu) {
    palette.register({
      id: "ssh.connect",
      title: "Connect via SSH...",
      group: "ssh",
      run: () => openSshMenu(),
    });
  }

  palette.register({
    id: "tab.new",
    title: "New tab",
    keybinding: "Ctrl+T",
    group: "tabs",
    run: () => tabs.newTab(),
  });

  palette.register({
    id: "pane.split.horizontal",
    title: "Split pane: above/below",
    keybinding: "Ctrl+Shift+O",
    group: "panes",
    run: () => tabs.splitActive("v"),
  });

  palette.register({
    id: "pane.split.vertical",
    title: "Split pane: left/right",
    keybinding: "Ctrl+Shift+E",
    group: "panes",
    run: () => tabs.splitActive("h"),
  });

  palette.register({
    id: "pane.close",
    title: "Close focused pane",
    keybinding: "Ctrl+Shift+W",
    group: "panes",
    run: () => tabs.closeActivePane(),
  });

  // TODO: add your own "predefined commands" here, e.g.:
  //
  // palette.register({
  //   id: "send.docker.ps",
  //   title: "Run: docker ps",
  //   run: async () => {
  //     // send keystrokes to the focused pane via a tabs helper, etc.
  //   },
  // });
}

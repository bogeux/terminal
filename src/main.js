import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { TabManager } from "./tabs.js";
import { Palette } from "./palette.js";
import { registerDefaultCommands } from "./commands.js";
import { pickShell } from "./shell-picker.js";

async function openSshMenu() {
  const hosts = await invoke("list_ssh_hosts");
  const entries = hosts.map((h) => {
    const addr = [h.user, h.hostname].filter(Boolean).join("@");
    const port = h.port ? `:${h.port}` : "";
    const suffix = addr ? `  —  ${addr}${port}` : "";
    return { name: `${h.alias}${suffix}`, command: ["ssh", h.alias] };
  });
  const picked = await pickShell(entries, workspace, { title: "Connect via SSH" });
  if (picked) await tabs.replaceFocusedShell(picked);
}

async function pickAwsProfile(title) {
  const profiles = await invoke("list_aws_profiles");
  const entries = profiles.map((p) => ({ name: p, command: [p] }));
  const picked = await pickShell(entries, workspace, { title });
  return picked ? picked.command[0] : null;
}

async function openAwsLogin() {
  const profile = await pickAwsProfile("AWS Login — choose profile");
  if (!profile) return;
  await tabs.writeToFocused(`aws sso login --profile ${profile}\r`);
}

async function openAwsConnect() {
  const profile = await pickAwsProfile("AWS: choose profile");
  if (!profile) return;

  let instances;
  try {
    instances = await invoke("list_aws_instances", { profile });
  } catch (err) {
    alert(`Failed to list instances: ${err}`);
    return;
  }
  if (instances.length === 0) {
    alert("No running instances for this profile.");
    return;
  }

  const entries = instances.map((i) => {
    const label = i.name ? `${i.name}  —  ${i.id}` : i.id;
    return {
      name: label,
      command: ["aws", "ssm", "start-session", "--target", i.id, "--profile", profile],
    };
  });
  const target = await pickShell(entries, workspace, { title: `AWS SSM on ${profile}` });
  if (target) await tabs.replaceFocusedShell(target);
}

const workspace = document.getElementById("workspace");
const tabsEl = document.getElementById("tabs");

const tabs = new TabManager({ tabsEl, workspace, invoke, listen });
const palette = new Palette({ root: document.getElementById("palette") });

registerDefaultCommands(palette, tabs, { openSshMenu, openAwsLogin, openAwsConnect });

window.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey && e.shiftKey;

  if (mod && e.code === "KeyP") { e.preventDefault(); palette.open(); return; }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyT") {
    e.preventDefault(); tabs.newTab(); return;
  }
  if (mod && e.code === "KeyT") {
    e.preventDefault(); tabs.newTab({ forcePick: true }); return;
  }
  if (mod && e.code === "KeyW") { e.preventDefault(); tabs.closeActivePane(); return; }
  if (mod && e.code === "KeyE") { e.preventDefault(); tabs.splitActive("v"); return; }
  if (mod && e.code === "KeyO") { e.preventDefault(); tabs.splitActive("h"); return; }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyD") {
    e.preventDefault(); tabs.closeActivePane(); return;
  }
  if (mod && e.code.startsWith("Arrow")) {
    e.preventDefault();
    tabs.resizeFocused(e.code.replace("Arrow", "").toLowerCase());
    return;
  }
  if (e.ctrlKey && e.code === "Tab") { e.preventDefault(); tabs.cycleTab(e.shiftKey ? -1 : 1); return; }
  if (e.altKey && e.code.startsWith("Arrow")) {
    e.preventDefault();
    tabs.focusDirection(e.code.replace("Arrow", "").toLowerCase());
    return;
  }
});

window.addEventListener("resize", () => tabs.refitActive());

await tabs.init();

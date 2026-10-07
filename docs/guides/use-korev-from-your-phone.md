---
title: Use Korev from your phone
parent: Guides
nav_order: 6
---

# Use Korev from your phone

The Korev phone app lets you follow and steer your agents while you are away from your Mac. The app talks to Korev on your Mac through [remote access](../reference/remote-access.html). Korev must be open on the Mac.

The app is not in the App Store or Google Play yet. You run it from the source with [Expo Go](https://expo.dev/go).

## Before you start

- Install [Tailscale](https://tailscale.com) on the Mac and on the phone, and sign in to the same network on both.
- Install Expo Go on the phone.
- On the Mac, install Node 24 and npm.

## Start the app

1. In a terminal on the Mac, run:

   ```sh
   cd korev-mobile
   npm ci
   REACT_NATIVE_PACKAGER_HOSTNAME=<tailscale-ip> npx expo start
   ```

2. Scan the QR code in the terminal with the phone camera. Expo Go opens the app.

Replace `<tailscale-ip>` with the Mac's Tailscale address, for example `100.101.102.103`. The Tailscale menu shows it. `REACT_NATIVE_PACKAGER_HOSTNAME` lets the phone load the app over Tailscale. If the phone and the Mac are on the same Wi-Fi, you can leave it out.

## Pair the phone

1. On the Mac, open **Settings → Remote access** in Korev and turn on **Remote access**.
2. Click **Show code**.
3. In the phone app, tap **Use the camera** and scan the code.

If the camera does not work, paste the code as text instead:

```json
{ "url": "<the address under the code>", "token": "<token>" }
```

The token is in `~/Library/Application Support/Korev/remote-token` on the Mac.

The phone shows next to Settings in the Korev sidebar while the app is open.

## What the app shows

The first screen lists the workspaces of each repository, in the same order as the Korev sidebar.

- A spinner shows while an agent or the setup script runs.
- **Needs input** shows when an agent waits for an answer.
- A dot shows when a workspace has agent output that you did not read.
- The PR number shows in the colour of its state: green when it is ready to merge, red when checks fail or changes are requested, amber for conflicts or running checks, and purple when it is merged.

## Chat with an agent

Tap a workspace to open its chats. The tabs at the top are the chats of the workspace. The last chat opens first. Tap **+ New chat** to start a chat with your default agent.

- Agent replies show as plain text. Markdown is not formatted yet.
- Tap a tool call or **Thinking…** to see its details.
- Type in the box at the bottom and tap **Send**. While the agent works, your message steers the agent or waits in the queue, the same as on the Mac.
- Tap **Stop** to stop the agent.
- Tap **Plan** to turn plan mode on or off. The box has a dashed border in plan mode.

When the agent asks before it uses a tool, asks a question or shows a plan, the chat shows a card. Answer it on the phone before the agent's turn ends.

The phone app cannot attach files yet, and opening a workspace on the phone does not mark it as read on the Mac.

## Pull request

The bar at the top of a workspace shows its pull request and the next step, the same as the button in the Korev workspace header:

- **Create PR**, **Fix errors** and **Resolve conflicts** send the prompt to the chat that is open.
- **Merge** asks you to confirm, then squash-merges the PR.
- **Archive** asks you to confirm, then archives the workspace.
- **Checks running**, **Draft**, **Changes requested** and **Waiting for review** open the PR on GitHub.

Tap the PR title to see its checks. Tap a check to open it.

## Unpair the phone

Tap **Unpair** at the top of the workspace list. To disconnect every device, click **Revoke all** in **Settings → Remote access** on the Mac. The phone then goes back to the pairing screen.

---
title: Use Korev from your phone
parent: Guides
nav_order: 6
---

# Use Korev from your phone

The Korev phone app shows your workspaces while you are away from your Mac. The app talks to Korev on your Mac through [remote access](../reference/remote-access.html). Korev must be open on the Mac.

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

## Unpair the phone

Tap **Unpair** at the top of the workspace list. To disconnect every device, click **Revoke all** in **Settings → Remote access** on the Mac. The phone then goes back to the pairing screen.

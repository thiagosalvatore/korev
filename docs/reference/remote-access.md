---
title: Remote access
parent: Reference
nav_order: 9
---

# Remote access

Remote access lets another device, such as a phone, use Korev on your Mac. The other device and the Mac must be on the same [Tailscale](https://tailscale.com) network.

## Turn it on

1. Open **Settings → Remote access**.
2. Turn on **Remote access**.
3. Click **Show code** and scan the code with the Korev app. See [Use Korev from your phone](../guides/use-korev-from-your-phone.html).

When remote access is on, Korev listens on the Mac's Tailscale address. If Tailscale is not running, Korev listens on `127.0.0.1` only, and the page says so. Start Tailscale, then turn remote access off and on again.

| Setting | Default | Meaning |
| --- | --- | --- |
| Remote access | Off | Start the remote access server |
| Port | `7420` | The port the server listens on. It must be from 1024 to 65535. Korev restarts the server when you change it. |

## Pairing code

The pairing code is a QR code that holds this JSON:

```json
{ "url": "http://100.101.102.103:7420", "token": "<token>" }
```

Anyone who has the code can use Korev on your Mac. Do not share it.

## Token

Every request must send `Authorization: Bearer <token>`. Korev makes the token the first time remote access starts. It is in `~/Library/Application Support/Korev/remote-token`, and only your user can read the file.

To disconnect every device, click **Revoke all** in **Settings → Remote access**. Korev makes a new token, and each device must scan the new pairing code.

## Calls

`POST /call` runs one Korev method. The request body is JSON:

```json
{ "method": "transcript", "args": ["<session id>"] }
```

The response is `{ "result": ... }`. If the method fails, the response is `{ "error": "..." }` with status `500`. An unknown method, or a method that a remote device may not call, gets status `404`.

A remote device can call only these methods:

`getState`, `transcript`, `send`, `stop`, `respondPermission`, `newSession`, `closeSession`, `updateSession`, `createWorkspaces`, `archiveWorkspace`, `listBranches`, `listPullRequests`, `listIssues`, `slashCommands`, `changes`, `fileDiff`, `rangeChanges`, `listFiles`, `readFile`, `prStatuses`, `reviewComments`, `createPr`, `fixChecks`, `resolveConflicts`, `mergePr`, `repoIcon`.

The arguments for each method are the same as in `KorevApi` in `korev-desktop/src/shared/api.ts`.

## Events

`GET /events` is a [Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events) stream. Korev sends these events:

| Event | Data |
| --- | --- |
| `state` | The full app state. Korev sends it again after each change. |
| `chat` | `{ sessionId, item }`. Korev sends the full chat item again each time it changes. |
| `toast` | `{ title, tone }` |

## Connected devices

A device counts as connected while its `/events` stream is open. While remote access is on, a phone icon shows next to Settings at the bottom of the sidebar. The icon is green and shows a count when one or more devices are connected. It is red if the server did not start. Hold the pointer on the icon to see the device names, or click it to open **Settings → Remote access**.

To give a device a name, send the `X-Korev-Device` header on `/events`, for example `X-Korev-Device: My iPhone`. If a device sends no name, Korev shows its IP address.

An agent waits for an answer to a permission prompt, a question or a plan only while its turn runs. Send `respondPermission` before the turn ends.

## Phone notifications

Korev can send its notifications to your phone through [ntfy](https://ntfy.sh). Korev sends one when an agent finishes or needs your input while the Korev window is not in focus. This is the same rule as for Mac notifications.

1. Install the ntfy app on your phone and subscribe to a topic. Pick a long topic name that nobody can guess.
2. In **Settings → General → Phone notifications**, enter the topic URL, for example `https://ntfy.sh/<topic>`.

On the public ntfy.sh server, anyone who knows the topic name can read its messages. Each message has the workspace name and the chat title. To keep them private, run your own ntfy server, for example on your Tailscale network.

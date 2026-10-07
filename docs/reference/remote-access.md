---
title: Remote access
parent: Reference
nav_order: 9
---

# Remote access

Remote access lets another device, such as a phone, use Korev on your Mac. The other device and the Mac must be on the same [Tailscale](https://tailscale.com) network.

Remote access is off by default. To turn it on, set `"remoteAccess": true` in the `settings` object of `~/Library/Application Support/Korev/korev-state.json`, then restart Korev.

When remote access is on, Korev listens on the Mac's Tailscale address. If Tailscale is not running when Korev starts, Korev listens on `127.0.0.1` only.

| Setting | Default | Meaning |
| --- | --- | --- |
| `remoteAccess` | `false` | Start the remote access server when Korev starts |
| `remotePort` | `7420` | The port the server listens on |

## Token

Every request must send `Authorization: Bearer <token>`. Korev makes the token the first time remote access starts. It is in `~/Library/Application Support/Korev/remote-token`, and only your user can read the file. To revoke every device, delete the file and restart Korev.

## Calls

`POST /call` runs one Korev method. The request body is JSON:

```json
{ "method": "transcript", "args": ["<session id>"] }
```

The response is `{ "result": ... }`. If the method fails, the response is `{ "error": "..." }` with status `500`. An unknown method, or a method that a remote device may not call, gets status `404`.

A remote device can call only these methods:

`getState`, `transcript`, `send`, `stop`, `respondPermission`, `newSession`, `closeSession`, `updateSession`, `createWorkspaces`, `archiveWorkspace`, `listBranches`, `listPullRequests`, `listIssues`, `slashCommands`, `changes`, `fileDiff`, `rangeChanges`, `listFiles`, `readFile`, `prStatuses`, `reviewComments`, `createPr`, `fixChecks`, `resolveConflicts`, `mergePr`.

The arguments for each method are the same as in `KorevApi` in `korev-desktop/src/shared/api.ts`.

## Events

`GET /events` is a [Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events) stream. Korev sends these events:

| Event | Data |
| --- | --- |
| `state` | The full app state. Korev sends it again after each change. |
| `chat` | `{ sessionId, item }`. Korev sends the full chat item again each time it changes. |
| `toast` | `{ title, tone }` |

## Connected devices

A device counts as connected while its `/events` stream is open. While remote access is on, a phone icon shows next to Settings at the bottom of the sidebar. The icon is green and shows a count when one or more devices are connected. Hold the pointer on the icon to see their names.

To give a device a name, send the `X-Korev-Device` header on `/events`, for example `X-Korev-Device: My iPhone`. If a device sends no name, Korev shows its IP address.

An agent waits for an answer to a permission prompt, a question or a plan only while its turn runs. Send `respondPermission` before the turn ends.

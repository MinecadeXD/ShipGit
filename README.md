<div align="center">
  <h1>ShipGit</h1>
  <p><strong>Interactive Git-to-SFTP deployment for Termux and Linux.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Node.js-%E2%89%A520-brightgreen?logo=node.js" alt="Node.js 20+" />
    <img src="https://img.shields.io/badge/Platform-Termux%20%7C%20Linux-blue" alt="Termux and Linux" />
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License" />
    <img src="https://img.shields.io/badge/Status-Early%20development-orange" alt="Early development" />
  </p>
</div>

ShipGit keeps deployment settings isolated by project. Create one sub-app per repository and deploy its files to an SFTP destination from a persistent interactive prompt.

> **Early development:** test against a non-production destination first. The initial file comparison uses remote file size, so changed files with the same size may be skipped. This limitation must be addressed before stable use.

## Features

- Both `shipgit` and `sg` open the same persistent prompt.
- Separate settings per sub-app under `~/.shipgit/apps/`.
- Clone a remote Git repository or use an existing local Git checkout.
- Configure branch, SFTP host/port/user/destination, exclusions and SSH key.
- Select an existing key, paste private key text, or generate an Ed25519 key.
- Read-only SFTP connection test during setup; setup never deploys automatically.
- `deploy --dry-run` preview.
- Remote deletion is disabled. Removing a sub-app never deletes remote files or the source repository.

## Requirements

- Node.js 20 or newer
- Git on `PATH`
- `ssh-keygen` only if generating a key
- An SFTP account and a key authorized by your hosting provider

## Install from source

```sh
git clone https://github.com/MinecadeXD/ShipGit.git
cd ShipGit
npm install
npm link
```

Run `shipgit` or `sg`.

## Commands

Manager prompt:

| Command | Action |
| --- | --- |
| `setup` | Create a sub-app and test SFTP access |
| `open <name>` | Enter a sub-app |
| `list` | List sub-apps |
| `remove <name>` | Remove only local ShipGit config |
| `help` / `exit` | Help / quit |

Sub-app prompt:

| Command | Action |
| --- | --- |
| `deploy` | Confirm and deploy |
| `deploy --dry-run` | Preview without uploading |
| `config` | Edit settings or test connection |
| `status` | Display non-secret settings and test SFTP |
| `back` / `help` | Return / show help |

Commands are scoped to the active prompt. For example, `deploy` works only inside an opened sub-app. This restriction applies only within ShipGit, not to the surrounding terminal.

## SSH keys and safety

Private keys are stored separately from app configuration with restrictive file permissions. For pasted keys, the terminal may echo input; only use a trusted, private terminal. Generated public keys must be registered with your host yourself—ShipGit cannot authorize them on your behalf.

- Setup tests authentication and reads the remote destination; it does not upload.
- Remote deletion is not implemented.
- Dry-run previews files, but a cloned repository may still fetch/update its local checkout.
- Never put private keys or credentials in public issues or repositories.
- File comparison is currently size-based and not yet reliable for production-critical deployments.

## Development

```sh
npm install
npm test
npm run check
```

MIT licensed; see [LICENSE](LICENSE).

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

> **Early development:** test against a non-production destination first. Same-sized remote files are downloaded to a temporary file and compared using SHA-256. This is more reliable than size-only checks, but may add time and bandwidth for large files.

## Features

- Both `shipgit` and `sg` open the same persistent prompt.
- Separate settings per sub-app under `~/.shipgit/apps/`.
- Clone a public Git repository, clone a private GitHub repository with a Personal Access Token (PAT), or use an existing local Git checkout.
- Configure branch, SFTP host/port/user/destination, exclusions and SSH key.
- Select an existing key, paste private key text, or generate an Ed25519 key.
- Read-only SFTP connection test during setup; setup never deploys automatically.
- `deploy --dry-run` preview.
- Remote deletion is disabled. Deleting a sub-app never deletes remote hosting files or an external local repository.

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
| `delete <name>` / `remove <name>` | Delete a sub-app and its ShipGit-managed clone/token |
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

## Private GitHub repositories

When choosing **Clone a remote Git repository**, ShipGit asks whether the repository is public or private. The private option accepts a GitHub Personal Access Token (PAT) through a masked prompt. This choice is not shown when using an existing local repository.

- Use an HTTPS URL such as `https://github.com/OWNER/REPO.git` for private token authentication.
- Prefer a fine-grained token limited to the selected repository with **Contents: Read-only** permission.
- The token is stored separately in the sub-app directory with restrictive file permissions, not in the Git remote URL or the app's JSON config.
- Git receives the token temporarily through an askpass helper for clone/fetch/pull. ShipGit does not print the token.
- Use `open <name>` then `config` to set/update the token later. Replacing a token does not change the repository URL.

## SSH keys and safety

Private keys are stored separately from app configuration with restrictive file permissions. For pasted keys, the terminal may echo input; only use a trusted, private terminal. Generated public keys must be registered with your host yourself—ShipGit cannot authorize them on your behalf.

- Setup tests authentication and reads the remote destination; it does not upload.
- Remote deletion is not implemented. The manager `delete <name>` command (also available as `remove <name>`) removes that sub-app's settings, stored token, and ShipGit-managed clone; it never deletes remote hosting files or an external local repository.
- Dry-run previews files, but a cloned repository may still fetch/update its local checkout.
- Never put private keys or credentials in public issues or repositories.
- File comparison uses size as a quick filter and SHA-256 for same-sized files. Remote comparison failures stop deployment instead of silently skipping the file.

## Development

```sh
npm install
npm test
npm run check
```

MIT licensed; see [LICENSE](LICENSE).

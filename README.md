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

ShipGit stores separate deployment settings for each app and publishes repository files to an SFTP destination. It is designed for Termux and Linux and does not require shell access on the hosting server.

> **Early development:** test with a dedicated, non-production remote directory first. Same-sized remote files are downloaded to a temporary file and compared with SHA-256, which is reliable but may use additional bandwidth.

## Features

- Interactive manager and per-app command prompt with high-contrast terminal colors and arrow-key menus where supported.
- Separate configuration for each app under `~/.shipgit/apps/`.
- Clone public or private GitHub repositories, or use an existing local Git checkout.
- Fetch branch names automatically and select one from a menu.
- Configure SFTP destination, SSH key, exclusions, and connection checks.
- Choose an existing private key, paste key text securely, or generate an Ed25519 key quietly.
- Separate `deploy` and `dry-run` commands.
- Optional remote deletion, disabled by default and limited to a dedicated absolute remote directory.
- Per-app deployment aliases that work from any directory.
- Private GitHub tokens and app configuration are stored separately with restricted file permissions.

## Requirements

- Node.js 20 or newer
- Git on `PATH`
- `ssh-keygen` only if generating an SSH key
- An SFTP account and a private key authorized by your hosting provider

## Install from source

```sh
git clone https://github.com/MinecadeXD/ShipGit.git
cd ShipGit
npm install
npm link
```

Run `shipgit` or `sg` to open the manager. Choose **Manage existing apps** to open, configure, or delete an app. Interactive menus use arrow keys and Enter in compatible terminals; numbered choices are used as a fallback. Set `NO_COLOR=1` to disable ANSI colors.

## App prompt commands

After opening an app, use its persistent prompt:

| Command | Action |
| --- | --- |
| `deploy` | Confirm and deploy files |
| `dry-run` | Compare local and remote files and preview uploads/deletions without changing remote files |
| `config` | Change settings, set a deploy alias, or toggle remote deletion |
| `status` | Show non-secret settings and test SFTP access |
| `help` | Show available commands |
| `back` | Return to app management |

`deploy --dry-run` is not used; dry-run is a separate command. A dry-run may fetch/update the local checkout of a cloned repository before comparing files, but it does not upload or delete remote SFTP files.

## Deploy from any directory with an alias

Configure an alias through **Manage Apps → Configure an app → Deploy alias**. The alias is intentionally not part of the setup sequence.

For example, if the alias is `website`:

```sh
sg website
sg website dry-run
```

- `sg website` runs a real deployment after confirmation.
- `sg website dry-run` previews changes without uploading or deleting remote files.
- The alias is stored in that app's configuration and resolves to that app regardless of the current working directory.
- Alias names may contain letters, numbers, dots, underscores, and hyphens. Built-in ShipGit commands are reserved. The `sg` executable must be available on your `PATH`.

## Branch selection

During setup and configuration, ShipGit attempts to fetch branch names from the selected remote repository or list branches from a local Git checkout. Choose the desired branch from the menu. If discovery fails, retry or enter the branch name manually. Private GitHub branch discovery uses the configured token.

## Private GitHub repositories

When cloning a remote repository, choose the private GitHub option to enter a Personal Access Token through a masked prompt. This choice is not shown when using an existing local repository.

- Use a clean HTTPS URL such as `https://github.com/OWNER/REPO.git`.
- Prefer a fine-grained token scoped to the repository with **Contents: Read-only** permission.
- The token is stored separately from the repository URL and JSON config with restrictive file permissions.
- ShipGit passes the token temporarily to Git through an askpass helper and does not print it.
- Use **Config → Set/update GitHub token** to replace it later.

## Remote deletion safety

Remote deletion is **OFF by default**. Enable it only through the app's **Config** menu. ShipGit requires a dedicated, normalized absolute remote directory (for example `/public_html`); `/` and `.` are rejected for deletion. When enabled, extra remote files within that configured directory may be deleted after deployment. ShipGit asks for an additional confirmation before a real deployment with deletion enabled.

Dry-run lists remote files that would be deleted without deleting them. Excluded paths are preserved. Remote deletion does not remove the configured remote directory itself, and ShipGit does not follow remote symbolic links.

Deleting an app removes its ShipGit settings and any ShipGit-managed clone/token. It does not delete files on the hosting server or an external local repository.

## SSH keys and privacy

Private-key paths and GitHub tokens are never printed as secret contents. Pasted private-key lines and tokens use masked input. Newly generated Ed25519 keys are created quietly, are not overwritten if the destination exists, and currently have no passphrase. Register the generated public key with your hosting provider yourself before deploying.

Use `status` to inspect the repository, branch, SFTP destination, SSH key path, exclusions, deletion state, and deploy alias. Tokens and private-key contents are never displayed.

## Development

```sh
npm install
npm test
npm run check
```

MIT licensed; see [LICENSE](LICENSE).

# SOPS & age Secrets Management Runbook

This runbook documents the secrets management workflow for the `pet-shelter` repository using **Mozilla SOPS** (Secrets OPerationS) and **`age` encryption**.

---

## 1. Architecture & Security Model

```
+-----------------------------------------------------------------------+
| Git Repository (Version Controlled & Publicly/Internally Visible)     |
|  - .sops.yaml              (Contains public age keys: age1...)        |
|  - .env.production.enc     (Encrypted env file, safe in git)          |
|  - .env.example            (Template for developer onboarding)        |
+-----------------------------------------------------------------------+
                                   ▲
                                   │ Decrypted via private key
+-----------------------------------------------------------------------+
| Secure Key Storage (NEVER committed to Git)                           |
|  - Local Dev:     ~/.config/sops/age/keys.txt (or %APPDATA%/sops/age) |
|  - CI/CD Server:  SOPS_AGE_KEY="AGE-SECRET-KEY-1..." (Env Var)        |
+-----------------------------------------------------------------------+
```

### Core Security Invariants
1. **Zero Plaintext Secrets in Git**: Plaintext `.env` and `.env.local` files are gitignored.
2. **Strict Boot Validation**: Secrets loaded into production must satisfy the entropy and policy checks in `src/lib/security/secrets.ts` via `assertSecretsConfigured()`.
3. **Decentralized Access**: Multiple team members and CI/CD runners can have distinct `age` keys listed in `.sops.yaml`.

---

## 2. Prerequisites & Installation

### Windows
```powershell
# Install via WinGet
winget install --id SecretsOPerationS.SOPS --accept-source-agreements --accept-package-agreements
winget install --id FiloSottile.age --accept-source-agreements --accept-package-agreements

# Or install via Chocolatey
choco install -y sops age.portable
```

### macOS
```bash
brew install sops age
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get install age
# Download SOPS binary from GitHub releases
SOPS_VER="3.13.3"
curl -LO "https://github.com/getsops/sops/releases/download/v${SOPS_VER}/sops-v${SOPS_VER}.linux.amd64"
sudo mv "sops-v${SOPS_VER}.linux.amd64" /usr/local/bin/sops
sudo chmod +x /usr/local/bin/sops
```

---

## 3. Initial Key Generation

If you are setting up a new developer machine or a new CI/CD runner:

### 1. Generate an `age` key pair
```bash
# On Linux / macOS:
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt

# On Windows (PowerShell):
$sopsDir = "$env:APPDATA\sops\age"
if (-not (Test-Path $sopsDir)) { New-Item -ItemType Directory -Path $sopsDir -Force }
age-keygen -o "$sopsDir\keys.txt"
```

### 2. Locate your Public Key
Inspect the generated `keys.txt`:
```
# public key: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AGE-SECRET-KEY-1YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
```
- **Public Key** (`age1...`): Add this to `.sops.yaml` in the root of the repository.
- **Private Key** (`AGE-SECRET-KEY-1...`): Keep this strictly secret on your machine.

---

## 4. Daily Developer Commands

We provide automated npm scripts to make interacting with SOPS seamless:

### 1. Verify SOPS & Key Status
```bash
npm run secrets:check
```
*Validates that SOPS is installed, locates your local age key, checks `.sops.yaml`, and verifies that `.env.production.enc` decrypts cleanly.*

### 2. Edit Encrypted Secrets Interactively
```bash
npm run secrets:edit:prod
```
*Opens `.env.production.enc` in your default terminal editor (or `$EDITOR`). When you save and exit, SOPS automatically encrypts the updated values before writing to disk.*

### 3. Decrypt Production Secrets to `.env.local`
```bash
npm run secrets:decrypt:local
```
*Decrypts `.env.production.enc` to `.env.local` for local debugging. (Ensure you never commit `.env.local`).*

### 4. Run Scripts with Decrypted Secrets
```bash
# Run any command with decrypted production variables injected into process.env:
npm run secrets:run -- node -e "console.log(process.env.DATABASE_URL)"
npm run secrets:run -- npm start
```

---

## 5. Adding Team Members (Multi-Recipient Workflow)

When a new team member joins:

1. The new member generates their key: `age-keygen -o ~/.config/sops/age/keys.txt`
2. The new member shares their **public key** (`age1...`).
3. An existing team member adds the new public key to `.sops.yaml`:
   ```yaml
   creation_rules:
     - path_regex: .*(\.env|\.enc|secrets\..*).*$
       age: >-
         age1existingkey...,
         age1newmemberkey...
   ```
4. Re-encrypt the secrets file for all recipients:
   ```bash
   sops updatekeys .env.production.enc
   ```
5. Commit and push the updated `.sops.yaml` and `.env.production.enc`.

---

## 6. CI/CD Integration (GitHub Actions)

To enable GitHub Actions to decrypt secrets during testing or deployment:

1. Generate a dedicated CI key pair or use an existing private key.
2. In GitHub repository settings:
   - Navigate to **Settings** > **Secrets and variables** > **Actions**.
   - Create a new repository secret named `SOPS_AGE_KEY`.
   - Set the value to the private key (`AGE-SECRET-KEY-1...`).
3. In your GitHub Actions workflow:
   ```yaml
   steps:
     - uses: actions/checkout@v4

     - name: Install SOPS
       uses: mdgreenwald/actions-sops@v3

     - name: Decrypt Environment for Build
       env:
         SOPS_AGE_KEY: ${{ secrets.SOPS_AGE_KEY }}
       run: |
         sops --decrypt --input-type dotenv --output-type dotenv .env.production.enc > .env.production
         npm run build
   ```

---

## 7. Troubleshooting & FAQs

### Q: "no matching creation rules found"
**Cause:** The file path being edited does not match the regex in `.sops.yaml`.
**Fix:** Ensure your file ends in `.enc` or matches `.env.*` (e.g. `.env.production.enc`).

### Q: "cannot decrypt: no private key found"
**Cause:** SOPS cannot find the private key matching the public key in `.sops.yaml`.
**Fix:** Verify that your private key exists in `~/.config/sops/age/keys.txt` (Linux/macOS) or `%APPDATA%\sops\age\keys.txt` (Windows), or set `$env:SOPS_AGE_KEY="AGE-SECRET-KEY-1..."`.

### Q: How do I rotate a compromised secret?
1. Open the encrypted file: `npm run secrets:edit:prod`
2. Change the secret (e.g. `SESSION_SECRET` or `DATABASE_URL`).
3. Save and commit `.env.production.enc`.
4. Deploy the updated build to production.

---

## Troubleshooting: `parsing time "...Z\x0d"`

The working copy of `.env.production.enc` has Windows (CRLF) line endings. SOPS's dotenv parser
splits on LF only, so every value keeps a carriage return and the timestamp fails first. The
committed file is LF, and `.gitattributes` marks it `text eol=lf` so it is always checked out LF.
A copy checked out before that rule is restored with the two git commands below, run separately
(Windows PowerShell 5 has no `&&`). The first is needed: on its own, `git checkout` skips a file
whose size and timestamp still match the index, so it would leave the CRLF copy in place. Neither
command changes what is committed.

```bash
git rm --cached -q .env.production.enc
git checkout HEAD -- .env.production.enc
npm run secrets:check
```

`secrets:check` refuses a CRLF copy by name and exits 1 on any `[FAIL]`. Never re-encrypt or
hand-convert the file to fix this: it is ciphertext, and the git copy is the backup.

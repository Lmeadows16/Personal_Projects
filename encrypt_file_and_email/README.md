# Encrypted File Email Sender via Gmail API (OAuth2)

This project allows you to encrypt a file (e.g. 'Hello.txt) with AES-256 encryption and email it securely using Gmail and OAuth2 - **no Gmail password required**

Ideal for sending password-protected files to non-technical users.

---

## What the Code Does

This Python script:

1. Uses '7z' to encrypt a file with AES-256 and a password
2. Sends the encrypted '.zip' as a gmail attachment
3. Authenticates with Gmail via OAuth 2.0 (no password stored)
4. Logs success/failure with optimal retry
5. Supports single or multiple recipients

---

## APIs, Tools, and Libraries Used

### Google Gmail API

- Used to **send email programmatically**
- Requires enabling Gmail API in [Google Cload Console](console.google.com/)
- Authenticates using OAuth 2.0

### OAuth 2.0 via Google Auth

- The script opens a browser so you can securely log in to Gmail
- A 'token.json' is saved so you don't have to log in again
- Uses scopes: 'googleapis.com/auth/gmail.send'

### 7-Zip CLI ('7z')

- Used to compress and encrypt the file
- Encryption is done with 'AES-256'
- Example command:

  ```bash
  7z a -tzip -p"password" -mem=AES256 protected.zip Helo.txt
  ```

### Python Libraries

- google-auth-oathlib
- google-api-python-client
- google-auth-httplib2
- email.message (standard library)
- subprocess, os, base64

---

## File Structure

```markdown
project-root/
├── credentials.json        # OAuth Client Secrets (From Google Cloud)
├── token.json              # Saved access token after first login
├── protected.zip           # Encrypted file
├── Hello.txt               # File to encrypt
├── recipients.csv
├── .gitignore
├── README.md
├── file_encrypt_send.py    # Main script
└── venv/
    ├── bin/
    ├── lib/
    └── ...
```

---

## How to Use It

### 1. Install Requirements

```bash
pip install google-api-python-client google auth-httplib2 google-auth-oauthlib
```

### 2. Install 7-Zip

- macOS: brew install p7zip
- Ubuntu: sudo apt install p7zip-full
- Windows: <https://www.7-zip.org>

### 3. Get OAuth Credentials

- Go to: <https://console.cloud.google.com/>
- Create a project &rarr; Enable Gmail API
- Create OAUth credentials (Desktop App) &rarr; download `credentials.json`

### 4. Run the Script

```bash
python file_encrypt_email_OAuth.py
```

The script will prompt you to log in the first time, then use `token.json` afterward.

---

## Security Practices

This project follows the following security practices:

- Uses OAuth 2.0 (not raw passwords)
- All files are encrypted with AES-256 before being sent
- Only the gmail.send permission is required
- Passphrases are sent outside of the email (you control this)

**Remember ~ DO NOT share passwords through this email!**

---

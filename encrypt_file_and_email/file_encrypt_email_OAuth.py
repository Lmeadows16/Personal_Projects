# Written by: Leyton Meadows
# May 27th, 2025
# This program will compress a file then encrypt it using AES-256. 
# The password protected .zip file is then emailed using the GMail API

import csv
import os
import base64
import subprocess
import time
import googleapiclient.errors
from email.message import EmailMessage
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Gmail API scope for sending email
SCOPES = ['https://www.googleapis.com/auth/gmail.send']

def zip_with_password(output_zip, files, password):
    # Encrypt files into a password protected zip using AES-256
    '''
    for file in files:
        if not os.path.isfile(file):
            raise FileNotFoundError('File not found')
    '''
    
    file_list = " ".join(f'"{file}"' for file in files)
    command = f'7z a -tzip -p"{password}" -mem=AES256 "{output_zip}" {file_list}'
    result = subprocess.run(command, shell=True)
    if result.returncode != 0:
        raise RuntimeError("Failed to create encrypted zip file")
    
def authenticate_gmail():
    # Load credentials or prompt user to log in
    creds = None
    if os.path.exists('encrypt_file_and_email/token.json'):
        creds = Credentials.from_authorized_user_file('encrypt_file_and_email/token.json', SCOPES)
        
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # Launch browser for for user to log into Gmail
            flow = InstalledAppFlow.from_client_secrets_file('encrypt_file_and_email/credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('encrypt_file_and_email/token.json', 'w') as token:
            token.write(creds.to_json())
    
    return build('gmail', 'v1', credentials=creds)

def create_email(sender, to, subject, body, attachment):
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = sender
    msg['To'] = to
    msg.set_content(body)
    
    with open(attachment, 'rb') as f:
        msg.add_attachment(f.read(), maintype='application', subtype='zip', filename=os.path.basename(attachment))
        
    encoded = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    return {'raw': encoded}

def send_email(service, message):
    try:
        result = service.users().messages().send(userId='me', body=message).execute()
        print(f"Email sent! ID: {result['id']}")
    except googleapiclient.errors.HttpError as e:
        print("Gmail API error:", e)
    except TimeoutError as e:
        print("Timeout occurred. Retrying in 5 seconds...")
        time.sleep(5)
        try:
            result = service.users().messages().send(userId='me', body=message).execute()
            print(f"Email sent after retry! ID: {result['id']}")
        except Exception as e:
            print("Failed again:", e)
    except Exception as e:
        print("Unexpected error:", e)

    
def main():
    # === Configuration ===
    sender = 'leytonmeadows16@gmail.com'
    subject = 'Encrypted File'
    
    gmail_service = authenticate_gmail()
    
    with open('encrypt_file_and_email/recipients.csv', newline='') as csvfile:
        body = (
        'Hi {name},\n\n'
        'This is a test of the OAuth version of file_encrypt_email_OAuth.\n'
        'The password is: {password}\n'
        '- Leyton'
        )
        reader = csv.DictReader(csvfile)
        for row in reader:
            name = row['name']
            email = row['email']
            filename = row['filename']
            password = row['password']
            
            if not os.path.exists(filename):
                print(f"Skipping {name}: File not found - {filename}")
                continue
            
            zip_name = f"{os.path.splitext(filename)[0]}_protected.zip"
            zip_with_password(zip_name, [filename], password)
            
            zip_size = os.path.getsize(zip_name)
            print(f"\nZip size: {zip_size / 1024:.2f} KB")
            email_message = create_email(sender, email, subject, body, zip_name)
            print(f"Sending to: {email}")
            print(f'Attachment: {zip_name}')
            print(f'Password: {password}')
            
            try:
                send_email(gmail_service, email_message)
            except Exception as e:
                print(f'Failed to send email: {e}')    
        
if __name__ == "__main__":
    main()
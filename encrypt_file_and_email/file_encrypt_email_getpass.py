import os
import smtplib
import getpass
from email.message import EmailMessage

def create_encrypted_zip(zip_name, files, password):
    files_str = " ".join(files)
    command = f'7z a -tzip -p"{password}" -mem=AES256 "{zip_name}" {files_str}'
    os.system(command)
    
def send_email(sender, recipient, subject, body, attachment, smtp_server, smtp_port):
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = sender
    msg['To'] = recipient
    msg.set_content(body)
    
    with open(attachment, 'rb') as f:
        file_data = f.read()
        file_name = os.path.basename(attachment)
        msg.add_attachment(file_data, maintype='application', subtype='zip', filename=file_name)
    
    password = getpass.getpass("Enter email password for {sender_email}: ")
    
    with smtplib.SMTP_SSL(smtp_server, smtp_port) as smtp:
        smtp.login(sender, password)
        smtp.send_message(msg)
        print("Email sent successfully")
        
# === CONFIGURATION ===
zip_file_name = 'protected.zip'
files_to_send = 'secret.txt'
zip_password = 'hello_world'

create_encrypted_zip(zip_file_name, files_to_send, zip_password)

# Email Configuration
sender = 'leytonmeadows16@gmail.com'
recipient = 'leyton.meadows@marquette.edu'
subject = 'Test of file_encrypt_email.py'
body = (
    'Hi,\n\n'
    'This is a test of sending an email using a python script with a password protected zip file attached'
    '- Leyton'
)
smtp_host = "smtp.gmail.com"
smtp_port = 465

send_email(sender, recipient, subject, body, zip_file_name, smtp_host, smtp_port)    
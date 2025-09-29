#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <termios.h>
#include <openssl/sha.h>
#include <openssl/rand.h>
#include <openssl/evp.h>

#define USER_MAX 100            /* Maximum number of user accounts the system can hold */
#define FILE_NAME "users.dat"   /* Filename for storing encrypted user credentials*/
#define USERNAME_LEN 32         /* Maximum length of a username (includes null terminator) */
#define SALT_LEN 16             /* Length of the randomly generated salt for password hashing */
#define HASH_LEN 32             /* Length of the SHA-256 hash (256 bits = 32 bytes) */
#define KEY_LEN 32              /* AES-256 encryption key length */
#define IV_LEN 16               /* AES block size / IV size for CBC mode (128 bits) */
#define MAX_ATTEMPTS 5          /* Maximum number of failed login attempts before lockout */
#define LOCKOUT_DURATION 5     /* Number of SECONDS to lock the user out of the system after MAX_ATTEMPTS */

/* Struct to hold user info (username, salt, & hash) */
typedef struct userinfo {
    char username[USERNAME_LEN];
    unsigned char salt[SALT_LEN];
    unsigned char hash[HASH_LEN];
} User;

void hash_pswd(const char *password, const unsigned char *salt, unsigned char *output);
void encrypt_and_save(User *users, int count);
int decrypt_and_load(User *users);
int find_user(User *users, int count, const char *username);
void register_user(User *users, int *count);
void login_user(User *users, int count);
void change_pswd(User *users, int count);
void view_users(User *users, int count);
void countdown(int seconds);
void read_pswd(char *buffer, size_t size);

const unsigned char AES_KEY[KEY_LEN] = "0123456789abcdef0123456789abcdef";
const unsigned char AES_IV[IV_LEN] = "abcdef9876543210";

/** Hash Password:
 * Hashes the given password using SHA-256 with a random salt. 
 * The result is a secure 32-byte hash.
 * 
 * @param password - The user's plaintext password
 * @param salt - A 16-byte random salt to prevent hash collisions and rainbow table attacks
 * @param output - A buffer where the resulting 32-byte hash is stored
 * 
 * Outline:
 * 1. Pad the message so its length ≡ 448 mod 512, then append the 64-bit length.
 * 2. Break the padded message into 512-bit chunks.
 * 3. For each chunk:
 *    a. Prepare a message schedule W[0..63]
 *       For i = 0 to 15:  W[i] = chunk[i]
 *       For i = 16 to 63:
 *          s0 = (W[i-15] ROTR 7) ^ (ROTR 18) ^ (SHR 3)
 *          s1 = (W[i-2] ROTR 17) ^ (ROTR 19) ^ (SHR 10)
 *          W[i] = W[i-16] + s0 + W[i-7] + s1
 * 
 *    b. Initialize working variables a-h with the current hash values
 * 
 *    c. Compression (64 rounds):
 *       For i = 0 to 63:
 *          S1 = (e ROTR 6) ^ (ROTR 11) ^ (ROTR 25)
 *          ch = (e AND f) XOR ((NOT e) AND g)
 *          temp1 = h + S1 + ch + K[i] + W[i]
 *          S0 = (a ROTR 2) ^ (ROTR 13) ^ (ROTR 22)
 *          maj = (a AND b) XOR (a AND c) XOR (b AND c)
 *          temp2 = S0 + maj
 * 
 *          h = g
 *          g = f
 *          f = e
 *          e = d + temp1
 *          d = c
 *          c = b
 *          b = a
 *          a = temp1 + temp2
 * 
 *    d. Add the compressed chunk to the current hash values:
 *       H0 = H0 + a
 *       H1 = H1 + b
 *       ...
 *       H7 = H7 + h
 * 
 * 4. After processing all chunks, concatenate H0‖H1‖...‖H7 to form the 256-bit hash.
 * 
 * Bitwise Operations
 *  - ROTR(x, n): Rotate right
 *  - SHR(x, n): Shift right
 *  - ^: XOR
 *  - AND, OR, NOT: Logical operations
 */
void hash_pswd(const char *password, const unsigned char *salt, unsigned char *output) {
    unsigned char buffer[256];
    int len = strlen(password);
    memcpy(buffer, password, len);
    memcpy(buffer + len, salt, SALT_LEN);
    SHA256(buffer, len + SALT_LEN, output);
}

/** Encrypt and Save:
 * Encrypts the array of User records using AES-256-CBC and saves it to a binary file (users.dat).
 * 
 * @param users - Array of user records to be encrypted
 * @param count - The number of users in the array to be saved
 */
void encrypt_and_save(User *users, int count) {
    FILE *fp = fopen(FILE_NAME, "wb");
    unsigned char plaintext[USER_MAX * sizeof(User)];
    unsigned char ciphertext[sizeof(plaintext) + EVP_MAX_BLOCK_LENGTH];
    int outlen1, outlen2;

    memcpy(plaintext, users, count * sizeof(User));

    EVP_CIPHER_CTX *ctx = EVP_CIPHER_CTX_new();
    EVP_EncryptInit_ex(ctx, EVP_aes_256_cbc(), NULL, AES_KEY, AES_IV);
    EVP_EncryptUpdate(ctx, ciphertext, &outlen1, plaintext, count * sizeof(User));
    EVP_EncryptFinal_ex(ctx, ciphertext + outlen1, &outlen2);
    EVP_CIPHER_CTX_free(ctx);

    fwrite(&count, sizeof(int), 1, fp);
    fwrite(ciphertext, 1, outlen1 + outlen2, fp);
    fclose(fp);
}

/** Decrypt and Load
 * Loads and decrypts the encrypted users.dat file and populated the array with valid User entries
 * 
 * @param users - The array where decrypted user records will be stored
 * @return - The number of users loaded, or 0 if the file doesn't exist
 */
int decrypt_and_load(User *users) {
    FILE *fp = fopen(FILE_NAME, "rb");
    if (!fp) return 0;

    int count;
    fread(&count, sizeof(int), 1, fp);

    unsigned char ciphertext[USER_MAX * sizeof(User) + EVP_MAX_BLOCK_LENGTH];
    unsigned char plaintext[USER_MAX * sizeof(User)];
    int inlen = fread(ciphertext, 1, sizeof(ciphertext), fp);
    fclose(fp);

    int outlen1, outlen2;
    EVP_CIPHER_CTX *ctx = EVP_CIPHER_CTX_new();
    EVP_DecryptInit_ex(ctx, EVP_aes_256_cbc(), NULL, AES_KEY, AES_IV);
    EVP_DecryptUpdate(ctx, plaintext, &outlen1, ciphertext, inlen);
    EVP_DecryptFinal_ex(ctx, plaintext + outlen1, &outlen2);
    EVP_CIPHER_CTX_free(ctx);

    memcpy(users, plaintext, count * sizeof(User));
    return count;
}

/** Find User:
 * Searches for a username in the user array
 * 
 * @param users - Array of user records
 * @param count - Number of users in the array
 * @param username - The username to look for
 * @return - The index of the matching user, or -1 if not found
 */
int find_user(User *users, int count, const char *username) {
    for (int i = 0; i < count; i++) {
        if (strcmp(users[i].username, username) == 0) {
            return i;
        }
    }
    return -1;
}

/** Register User:
 * Handles user registration: 
 *      -> prompts for a username and password
 *      -> Creates salt + hash
 *      -> Stores the user
 * 
 * @param users - Array where the new user will be added to
 * @param count - Pointer to the current number of users (eventually gets incremented)
 */
void register_user(User *users, int *count) {
    if (*count >= USER_MAX) {
        printf("User limit reached.\n");
        return;
    }

    char username[USERNAME_LEN], password[100];
    printf("Enter new username: ");
    fgets(username, sizeof(username), stdin);
    username[strcspn(username, "\n")] = 0;

    if (find_user(users, *count, username) != -1) {
        printf("Username already exists.\n");
        return;
    }

    printf("Enter new password: ");
    read_pswd(password, sizeof(password));
    
    User new_user;
    strncpy(new_user.username, username, USERNAME_LEN);
    RAND_bytes(new_user.salt, SALT_LEN);
    hash_pswd(password, new_user.salt, new_user.hash);

    users[*count] = new_user;
    (*count)++;

    encrypt_and_save(users, *count);
    printf("User registered successfully.\n");
}

/** Login User:
 * Prompts the user to enter their username and password
 * & verifies the password against the stored hash
 * 
 * @param users - Array of existing user records
 * @param count - Total number of users in the system */
void login_user(User *users, int count) {
    char username[USERNAME_LEN], password[100];
    printf("Username: ");
    fgets(username, sizeof(username), stdin);
    username[strcspn(username, "\n")] = 0;

    int user_index = find_user(users, count, username);
    if (user_index == -1) {
        printf("User not found.\n");
        return;
    }

    int attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
        // if (attempts >= MAX_ATTEMPTS) {
        //     countdown(LOCKOUT_DURATION); // 60 second lockout
        //     attempts = 0; // reset after lockout
        // }

        printf("Password: ");
        read_pswd(password, sizeof(password));
        /*
        fgets(password, sizeof(password), stdin);
        password[strcspn(password, "\n")] = 0;
        */

        unsigned char input_hash[HASH_LEN];
        hash_pswd(password, users[user_index].salt, input_hash);

        if (memcmp(input_hash, users[user_index].hash, HASH_LEN) == 0) {
            printf("Login Successful!\n");
            return;
        } else {
            printf("Incorrect password. Attempts: %d/%d\n", ++attempts, MAX_ATTEMPTS);
        }
    }
    countdown(LOCKOUT_DURATION);
}

/** Change Password:
 * Authenticates the user and allows them to update their password.
 *      -> Regenerates the salt and hash
 * 
 * @param users - Array of user records
 * @param count - Number of users currently in the system
 */
void change_pswd(User *users, int count) {
    char username[USERNAME_LEN], oldpswd[100], newpswd[100];
    printf("Username: ");
    fgets(username, sizeof(username), stdin);
    username[strcspn(username, "\n")] = 0;

    int user_index = find_user(users, count, username);
    if (user_index == -1) {
        printf("User not found.\n");
        return;
    }

    printf("Old Password: ");
    read_pswd(oldpswd, sizeof(oldpswd));

    /*
    fgets(oldpswd, sizeof(oldpswd), stdin);
    oldpswd[strcspn(oldpswd, "\n")] = 0;
    */

    unsigned char input_hash[HASH_LEN];
    hash_pswd(oldpswd, users[user_index].salt, input_hash);

    if (memcmp(input_hash, users[user_index].hash, HASH_LEN) != 0) {
        printf("Incorrect password.\n");
        return;
    }

    printf("New password: ");
    read_pswd(newpswd, sizeof(newpswd));

    /*
    fgets(newpswd, sizeof(newpswd), stdin);
    newpswd[strcspn(newpswd, "\n")] = 0;
    */
    RAND_bytes(users[user_index].salt, SALT_LEN);
    hash_pswd(newpswd, users[user_index].salt, users[user_index].hash);
    encrypt_and_save(users, count);

    printf("Password changed successfully.\n");
}

/** View Users:
 * Prints out all usernames along with their hash and salt in hexadecimal
 * (solely used for testing)
 * 
 * @param users - Array of user records
 * @param count - Number of registered users
 */
void view_users(User *users, int count) {
    printf("\n%-20s %-64s %-32s\n", "Username", "Password Hash", "Salt");
    for (int i = 0; i < count; i++) {
        printf("%-20s ", users[i].username);
        for (int j = 0; j < HASH_LEN; j++)
            printf("%02x", users[i].hash[j]);
        printf(" ");
        for (int j = 0; j < SALT_LEN; j++)
            printf("%02x", users[i].salt[j]);
        printf("\n");
    }
}

/** Countdown:
 * Displays a countdown in seconds
 * Helper function for user lockout
 * 
 * @param seconds - How long (in seconds) the countdown will run
 */
void countdown(int seconds) {
    for (int i = seconds; i > 0; i--) {
        printf("\rToo many failed attempts. Try again in %d seconds...", i);
        fflush(stdout);
        sleep(1);
    }
    printf("\n");
}

/** Read Password: 
 * Helper function that disables character echoing in the terminal (Adds authenticity)
 * 
 * @param buffer
 * @param size
*/
void read_pswd(char *buffer, size_t size) {
    struct termios oldterm, newterm;

    // Turn echoing off
    tcgetattr(STDIN_FILENO, &oldterm);
    newterm = oldterm;
    newterm.c_lflag &= ~(ECHO); // Disable character echo
    tcsetattr(STDIN_FILENO, TCSANOW, &newterm);

    // Read the password
    // printf("Password: ");
    fflush(stdout);
    fgets(buffer, size, stdin);
    buffer[strcspn(buffer, "\n")] = 0; // Strip newline
    printf("\n");

    // Restore original settings
    tcsetattr(STDIN_FILENO, TCSANOW, &oldterm);

}
int main() {
    User users[USER_MAX];
    int user_count = decrypt_and_load(users);

    while (1) {
        printf("\n[R]egister new\n[L]ogin\n[C]hange Password\n[V]iew USers (PlainText)\n[E]xit\n> ");
        char option[4];
        fgets(option, sizeof(option), stdin);

        switch(option[0]) {
            case 'R': case 'r':
                register_user(users, &user_count); 
                break;
            case 'L': case 'l':
                login_user(users, user_count); 
                break;
            case 'C': case 'c':
                change_pswd(users, user_count); 
                break;
            case 'V': case 'v':
                view_users(users, user_count); 
                break;
            case 'E': case 'e':
                exit(0);
            default:
                printf("Invalid option. Please try again.\n");
        }
    }
}


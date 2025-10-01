# COSC 4360 - System and Software Security Spring '25
# Makefile for userauth.c on macOS with OpenSSL (Homebrew)

CC = gcc
CFLAGS = -Wall -Wextra -I/opt/homebrew/opt/openssl/include
LDFLAGS = -L/opt/homebrew/opt/openssl/lib -lssl -lcrypto

SRC = userauth.c
OUT = userauth

all:$(OUT)

$(OUT): $(SRC)
	$(CC) $(CFLAGS) -o $(OUT) $(SRC) $(LDFLAGS)

clean:
	rm -f $(OUT)
	rm users.dat

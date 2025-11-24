#!/bin/bash

# Script to get SHA-1 and SHA-256 fingerprints from Android keystore
# Usage: ./get-keystore-fingerprints.sh [path-to-keystore] [alias] [password]

KEYSTORE_PATH=${1:-"android/app/debug.keystore"}
KEYSTORE_ALIAS=${2:-"androiddebugkey"}
KEYSTORE_PASSWORD=${3:-"android"}

echo "Getting fingerprints from keystore: $KEYSTORE_PATH"
echo "Alias: $KEYSTORE_ALIAS"
echo ""

if [ ! -f "$KEYSTORE_PATH" ]; then
    echo "Error: Keystore file not found at $KEYSTORE_PATH"
    echo ""
    echo "For EAS Build keystore:"
    echo "1. Run: eas credentials"
    echo "2. Select Android -> Production -> Keystore"
    echo "3. Download the keystore file"
    echo "4. Run this script with the downloaded keystore path"
    exit 1
fi

echo "SHA-1 Fingerprint:"
keytool -list -v -keystore "$KEYSTORE_PATH" -alias "$KEYSTORE_ALIAS" -storepass "$KEYSTORE_PASSWORD" | grep -A 1 "SHA1:" | grep -oE "[0-9A-F]{2}(:[0-9A-F]{2}){19}"

echo ""
echo "SHA-256 Fingerprint:"
keytool -list -v -keystore "$KEYSTORE_PATH" -alias "$KEYSTORE_ALIAS" -storepass "$KEYSTORE_PASSWORD" | grep -A 1 "SHA256:" | grep -oE "[0-9A-F]{2}(:[0-9A-F]{2}){31}"

echo ""
echo "=========================================="
echo "Copy these fingerprints and add them to:"
echo "Google Cloud Console -> APIs & Services -> Credentials"
echo "-> Your OAuth 2.0 Client ID -> SHA certificate fingerprints"
echo "=========================================="


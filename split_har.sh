#!/usr/bin/env bash

set -euo pipefail

# Check if filename argument is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <input_file.har>"
    echo "Extracts each log entry from a HAR file into separate files"
    exit 1
fi

INPUT_FILE="$1"

# Check if file has .har extension
if [[ ! "$INPUT_FILE" =~ \.har$ ]]; then
    echo "Error: Input file must have .har extension"
    echo "Usage: $0 <input_file.har>"
    exit 1
fi

# Check if file exists
if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: File '$INPUT_FILE' not found"
    exit 1
fi

# Extract base name without extension
BASE_NAME="${INPUT_FILE%.har}"

# Extract entries and write to separate files
jq -c '.log.entries[] | del(._initiator)' "$INPUT_FILE" | while IFS= read -r entry; do
    # Initialize counter on first iteration
    if [ ! -f "${BASE_NAME}.counter" ]; then
        echo "0" > "${BASE_NAME}.counter"
    fi
    
    # Read and increment counter
    COUNTER=$(cat "${BASE_NAME}.counter")
    COUNTER=$((COUNTER + 1))
    echo "$COUNTER" > "${BASE_NAME}.counter"
    
    # Write entry to file with HAR structure
    OUTPUT_FILE="${BASE_NAME}.${COUNTER}.har"
    echo "{\"log\":{\"entries\":[$entry]}}" | jq '.' > "$OUTPUT_FILE"
    echo "Created: $OUTPUT_FILE"
done

# Clean up counter file
rm -f "${BASE_NAME}.counter"

echo "Done! Extracted entries from $INPUT_FILE"


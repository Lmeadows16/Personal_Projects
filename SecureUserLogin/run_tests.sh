#!/bin/bash

mkdir -p logs
mkdir -p expected_outputs
> test_results.dif  # clear or create the diff file

# Step 1: Clean up previous user data
rm -f users.dat logs/*

# Step 2: Run the expect automation script
expect test_auth.expect

# Step 3: Compare outputs
pass_count=0
fail_count=0

for i in {1..7}; do
    expected="expected_outputs/test$i.txt"
    actual="logs/actual$i.txt"
if [ -f "$expected" ] && [ -f "$actual" ]; then
    # Flatten both files by removing all newlines
    expected_flat=$(tr -d '\r' < "$expected" | tr -s '[:space:]')
    actual_flat=$(tr -d '\r' < "$actual" | tr -s '[:space:]')

    if [ "$expected_flat" = "$actual_flat" ]; then
        echo "Test $i: PASSED" >> test_results.dif
        ((pass_count++))
    else
        echo "Test $i: FAILED" >> test_results.dif
        
    fi
    echo "--- Expected (flattened):" >> test_results.dif
    echo "$expected_flat" >> test_results.dif
    echo "--- Actual (flattened):" >> test_results.dif
    echo "$actual_flat" >> test_results.dif
    echo "----------------------------------------" >> test_results.dif
else
    echo "Test $i: MISSING OUTPUT OR EXPECTED FILE" >> test_results.dif
    ((fail_count++))
fi

done

# Final summary in diff file
echo "" >> test_results.dif
echo "Summary: $pass_count passed, $((7 - pass_count)) failed." >> test_results.dif

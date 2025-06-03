#!/bin/bash

# Function to add .js extension to imports in a file
add_js_extensions() {
    local file="$1"
    echo "Processing: $file"
    
    # Create a temporary file
    temp_file=$(mktemp)
    
    # Process the file line by line
    while IFS= read -r line; do
        # Match import statements with relative paths (starting with ./ or ../)
        if echo "$line" | grep -E "^import.*from ['\"](\./|\.\./)[^'\"]*['\"]" > /dev/null; then
            # Check if the import already has .js extension
            if ! echo "$line" | grep -E "from ['\"](\./|\.\./)[^'\"]*\.js['\"]" > /dev/null; then
                # Add .js extension before the closing quote
                line=$(echo "$line" | sed -E "s/(from ['\"](\./|\.\./)[^'\"]*)(['\"]);?$/\1.js\3/")
            fi
        fi
        echo "$line"
    done < "$file" > "$temp_file"
    
    # Replace the original file
    mv "$temp_file" "$file"
}

# Count files before processing
total_files=0
modified_files=0

# Process all TypeScript files in the specified directories
for dir in "src" "scrapers/src" "api/src"; do
    if [ -d "$dir" ]; then
        while IFS= read -r -d '' file; do
            total_files=$((total_files + 1))
            
            # Check if file has imports that need .js extension
            if grep -E "^import.*from ['\"](\./|\.\./)[^'\"]*['\"]" "$file" | grep -v "\.js['\"]" > /dev/null 2>&1; then
                add_js_extensions "$file"
                modified_files=$((modified_files + 1))
            fi
        done < <(find "$dir" -name "*.ts" -type f -print0)
    fi
done

echo ""
echo "Summary:"
echo "Total TypeScript files processed: $total_files"
echo "Files modified: $modified_files"
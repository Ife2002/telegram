#!/bin/bash

echo "Current SERVICE_TYPE is: $SERVICE_TYPE"

if [ "$SERVICE_TYPE" = "bot" ]; then
    echo "Starting Discord Bot..."
    cd discord && ts-node index.ts
elif [ "$SERVICE_TYPE" = "server" ]; then
    echo "Starting Nest Server..."
    npm run start:server
else
    echo "ERROR: SERVICE_TYPE not set correctly"
    exit 1
fi
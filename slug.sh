#!/usr/bin/env bash
set -e

APP_JSON="app.json"

if [ ! -f "$APP_JSON" ]; then
  echo "❌ No app.json found in $(pwd)"
  exit 1
fi

# Extract current slug and projectId from app.json
CURRENT_SLUG=$(jq -r '.expo.slug' "$APP_JSON")
PROJECT_ID=$(jq -r '.expo.extra.eas.projectId' "$APP_JSON")

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" == "null" ]; then
  echo "❌ No projectId found in app.json → run 'eas init' first."
  exit 1
fi

echo "🔍 Current slug in app.json: $CURRENT_SLUG"
echo "🔍 Linked EAS projectId: $PROJECT_ID"

# Fetch the slug from Expo's API for this projectId
EAS_PROJECT_SLUG=$(curl -s \
  -H "Authorization: Bearer $EXPO_TOKEN" \
  "https://api.expo.dev/v2/projects/$PROJECT_ID" \
  | jq -r '.data.slug')

if [ -z "$EAS_PROJECT_SLUG" ] || [ "$EAS_PROJECT_SLUG" == "null" ]; then
  echo "❌ Could not fetch slug from Expo API — check EXPO_TOKEN."
  exit 1
fi

echo "🔍 Slug on Expo servers: $EAS_PROJECT_SLUG"

# If mismatch, update app.json
if [ "$CURRENT_SLUG" != "$EAS_PROJECT_SLUG" ]; then
  echo "⚠️ Slug mismatch detected — fixing..."
  jq --arg slug "$EAS_PROJECT_SLUG" '.expo.slug = $slug' "$APP_JSON" > tmp.$$.json
  mv tmp.$$.json "$APP_JSON"
  echo "✅ Updated slug in app.json to '$EAS_PROJECT_SLUG'"
else
  echo "✅ Slug already matches — no changes needed."
fi

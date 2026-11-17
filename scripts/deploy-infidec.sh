#!/usr/bin/env bash
# Deploys QwikMart to the Firebase project qwikmart-infidec with the service-account key in secret/.
#
#   scripts/deploy-infidec.sh backend   Firestore rules + indexes, Storage rules, Cloud Functions
#   scripts/deploy-infidec.sh web       customer website  → https://qwikmart-infidec.web.app
#   scripts/deploy-infidec.sh admin     admin panel       → https://qwikmart-admin.web.app
#   scripts/deploy-infidec.sh all       all of the above
#
# The websites are Next.js apps deployed through Firebase Hosting's framework support (firebase.json); their
# NEXT_PUBLIC_* config is exported here, so a build never picks up stale values from a developer's web/.env.local or
# admin/.env.local. These values are the public Firebase web config, not secrets.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=qwikmart-infidec
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/secret/qwikmart-infidec-firebase.json"
[ -f "$GOOGLE_APPLICATION_CREDENTIALS" ] || { echo "Missing $GOOGLE_APPLICATION_CREDENTIALS"; exit 1; }
export FUNCTIONS_DISCOVERY_TIMEOUT=60

firebase_env() {
  export NEXT_PUBLIC_USE_MOCK=false NEXT_PUBLIC_USE_EMULATORS=false
  export NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyABX9YfiY7lP4uka4QHj2IYkRm9NnK-V3A
  export NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$PROJECT.firebaseapp.com
  export NEXT_PUBLIC_FIREBASE_PROJECT_ID=$PROJECT
  export NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$PROJECT.firebasestorage.app
  export NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=751479275108
  export NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION=asia-south1
}

deploy_backend() {
  (cd firebase && npx firebase deploy --project "$PROJECT" --only firestore,storage,functions --non-interactive --force)
}

deploy_web() {
  (
    firebase_env
    export NEXT_PUBLIC_FIREBASE_APP_ID=1:751479275108:web:65f01d7c5cf842b2f7a971
    export NEXT_PUBLIC_SITE_URL=https://$PROJECT.web.app
    npx firebase deploy --project "$PROJECT" --only hosting:qwikmart-infidec --non-interactive --force
  )
}

deploy_admin() {
  (
    firebase_env
    export NEXT_PUBLIC_FIREBASE_APP_ID=1:751479275108:web:0f4052387d6d0662f7a971
    npx firebase deploy --project "$PROJECT" --only hosting:qwikmart-admin --non-interactive --force
  )
}

npx firebase experiments:enable webframeworks >/dev/null

case "${1:-}" in
  backend) deploy_backend ;;
  web) deploy_web ;;
  admin) deploy_admin ;;
  all) deploy_backend && deploy_web && deploy_admin ;;
  *) echo "usage: $0 backend|web|admin|all"; exit 1 ;;
esac

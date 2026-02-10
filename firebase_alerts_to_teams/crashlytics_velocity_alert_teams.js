// ================================================================
//  CRASHLYTICS VELOCITY ALERT → MICROSOFT TEAMS
//  Firebase Cloud Function (2nd Gen) + Teams Incoming Webhook
// ================================================================


// ================================================================
//  STEP 1: SET UP INCOMING WEBHOOK IN MICROSOFT TEAMS
// ================================================================
//
//  Option A — Classic Teams (Connectors):
//    1. Open Microsoft Teams → go to the channel for alerts
//    2. Click "..." next to the channel name → "Manage channel"
//    3. Expand "Connectors" section
//    4. Search "Incoming Webhook" → click "Configure"
//    5. Name it, e.g. "Crashlytics Alerts" → click "Create"
//    6. Copy the generated webhook URL
//
//  Option B — New Teams (Workflows):
//    1. Go to the channel → click "..." → "Workflows"
//    2. Choose "Post to a channel when a webhook request is received"
//    3. Follow the prompts → copy the generated URL
//
//  Save the URL — you'll set it as a Firebase secret in Step 3.
//
// ================================================================


// ================================================================
//  STEP 2: CLOUD FUNCTION — functions/index.js
// ================================================================
//
//  Prerequisites:
//    - Firebase project on the Blaze (pay-as-you-go) plan
//    - Cloud Functions for Firebase initialized
//    - Crashlytics SDK: Android v18.6.0+ (BoM v32.6.0+)
//
//  Install dependencies:
//    cd functions
//    npm install firebase-functions@latest firebase-admin axios
//
// ================================================================

const { onVelocityAlertPublished } = require("firebase-functions/v2/alerts/crashlytics");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const axios = require("axios");

// Define the Teams webhook URL as a secret (secure, not in source code)
const TEAMS_WEBHOOK_URL = defineSecret("TEAMS_WEBHOOK_URL");

/**
 * Triggered automatically when Firebase Crashlytics detects a
 * velocity alert — i.e., a single crash issue suddenly impacts
 * a significant percentage of user sessions within a short window.
 *
 * Event payload (event.data.payload) contains:
 *   - issue.id           : Crashlytics issue ID
 *   - issue.title        : Crash title / summary
 *   - issue.subtitle     : Additional crash context
 *   - issue.appVersion   : App version affected
 *   - createTime         : When the alert was created
 *   - crashCount         : Number of crashes in the velocity window
 *   - crashPercentage    : % of sessions affected
 *   - firstVersion       : First app version with this issue
 */
exports.sendVelocityAlertToTeams = onVelocityAlertPublished(
    { secrets: [TEAMS_WEBHOOK_URL] },
    async (event) => {
        logger.info("🚨 Crashlytics velocity alert received", event.data.payload);

        const appId = event.appId;
        const {
            issue,
            createTime,
            crashCount,
            crashPercentage,
            firstVersion,
        } = event.data.payload;

        // Deep link to the issue in the Firebase Console
        const firebaseConsoleLink =
            `https://console.firebase.google.com/project/_/crashlytics/app/${appId}/issues/${issue.id}`;

        // Build the Teams Adaptive Card
        const teamsMessage = {
            type: "message",
            attachments: [
                {
                    contentType: "application/vnd.microsoft.card.adaptive",
                    content: {
                        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                        type: "AdaptiveCard",
                        version: "1.4",
                        body: [
                            // ── Header ──
                            {
                                type: "ColumnSet",
                                columns: [
                                    {
                                        type: "Column",
                                        width: "auto",
                                        items: [
                                            {
                                                type: "TextBlock",
                                                text: "🔥",
                                                size: "ExtraLarge",
                                            },
                                        ],
                                    },
                                    {
                                        type: "Column",
                                        width: "stretch",
                                        items: [
                                            {
                                                type: "TextBlock",
                                                text: "Crashlytics Velocity Alert",
                                                weight: "Bolder",
                                                size: "Large",
                                                color: "Attention",
                                            },
                                            {
                                                type: "TextBlock",
                                                text: "A crash issue is rapidly impacting users",
                                                spacing: "None",
                                                isSubtle: true,
                                            },
                                        ],
                                    },
                                ],
                            },

                            // ── Issue Title ──
                            {
                                type: "TextBlock",
                                text: issue.title || "Unknown issue",
                                weight: "Bolder",
                                size: "Medium",
                                wrap: true,
                                spacing: "Medium",
                            },

                            // ── Issue Subtitle ──
                            ...(issue.subtitle
                                ? [
                                      {
                                          type: "TextBlock",
                                          text: issue.subtitle,
                                          isSubtle: true,
                                          wrap: true,
                                          spacing: "None",
                                      },
                                  ]
                                : []),

                            // ── Separator ──
                            {
                                type: "ColumnSet",
                                separator: true,
                                spacing: "Medium",
                                columns: [],
                            },

                            // ── Details ──
                            {
                                type: "FactSet",
                                facts: [
                                    {
                                        title: "💥 Crash Count",
                                        value: crashCount
                                            ? String(crashCount)
                                            : "N/A",
                                    },
                                    {
                                        title: "📊 Sessions Affected",
                                        value: crashPercentage
                                            ? `${crashPercentage}%`
                                            : "N/A",
                                    },
                                    {
                                        title: "📱 App Version",
                                        value: issue.appVersion || "N/A",
                                    },
                                    {
                                        title: "🏷️ First Seen In",
                                        value: firstVersion || "N/A",
                                    },
                                    {
                                        title: "🆔 Issue ID",
                                        value: issue.id || "N/A",
                                    },
                                    {
                                        title: "📦 App ID",
                                        value: appId || "N/A",
                                    },
                                    {
                                        title: "🕐 Alert Time",
                                        value: createTime
                                            ? new Date(createTime).toLocaleString()
                                            : new Date().toLocaleString(),
                                    },
                                ],
                            },
                        ],

                        // ── Action Button → Open in Firebase Console ──
                        actions: [
                            {
                                type: "Action.OpenUrl",
                                title: "🔍 View in Firebase Console",
                                url: firebaseConsoleLink,
                                style: "destructive",
                            },
                        ],
                    },
                },
            ],
        };

        // Send to Microsoft Teams
        try {
            const response = await axios.post(
                TEAMS_WEBHOOK_URL.value(),
                teamsMessage,
                { headers: { "Content-Type": "application/json" } }
            );
            logger.info("✅ Teams notification sent successfully. Status:", response.status);
        } catch (error) {
            logger.error(
                "❌ Failed to send Teams notification:",
                error.response?.data || error.message
            );
            throw error; // Rethrow so Cloud Functions marks it as failed
        }
    }
);


// ================================================================
//  STEP 3: SET THE TEAMS WEBHOOK URL AS A FIREBASE SECRET
// ================================================================
//
//  Using Firebase CLI, store the webhook URL securely:
//
//    firebase functions:secrets:set TEAMS_WEBHOOK_URL
//
//  When prompted, paste your Teams webhook URL.
//
//  This is more secure than functions:config because:
//    - The value is stored in Google Secret Manager
//    - It's never exposed in source code or logs
//    - It's injected at runtime only
//
// ================================================================


// ================================================================
//  STEP 4: CONFIGURE VELOCITY ALERTS IN FIREBASE CONSOLE
// ================================================================
//
//  Make sure velocity alerts are enabled and thresholds are set:
//
//  1. Go to Firebase Console → your project
//  2. Navigate to Crashlytics dashboard
//  3. Select your app from the dropdown
//  4. Click "..." (overflow menu) in the Issues pane
//  5. Select "Velocity alert settings"
//  6. Set the threshold:
//     - Percentage of sessions (0.1% – 1%, default: 1%)
//     - Minimum users (≥ 10, default: 25)
//
//  An alert triggers when, within a 1-hour window:
//    ✔ A crash issue exceeds your % threshold
//    ✔ AND affects at least the minimum number of users
//    ✔ AND the issue was not previously trending
//
// ================================================================


// ================================================================
//  STEP 5: DEPLOY
// ================================================================
//
//  # Install dependencies
//  cd functions
//  npm install firebase-functions@latest firebase-admin axios
//
//  # Set the secret
//  firebase functions:secrets:set TEAMS_WEBHOOK_URL
//
//  # Deploy only this function
//  firebase deploy --only functions:sendVelocityAlertToTeams
//
//  # Verify deployment
//  firebase functions:log --only sendVelocityAlertToTeams
//
// ================================================================


// ================================================================
//  STEP 6: TESTING
// ================================================================
//
//  To verify the full pipeline:
//
//  1. Force a test crash in your Android app:
//
//     // In your MainActivity or a test button:
//     import com.google.firebase.crashlytics.FirebaseCrashlytics
//
//     FirebaseCrashlytics.getInstance().log("Testing velocity alert")
//     throw RuntimeException("Test crash for velocity alert")
//
//  2. Note: Velocity alerts require multiple users to be affected
//     within the threshold window. For testing the Teams webhook
//     directly, you can use curl:
//
//     curl -X POST "YOUR_TEAMS_WEBHOOK_URL" \
//       -H "Content-Type: application/json" \
//       -d '{
//         "type": "message",
//         "attachments": [{
//           "contentType": "application/vnd.microsoft.card.adaptive",
//           "content": {
//             "type": "AdaptiveCard",
//             "version": "1.4",
//             "body": [{
//               "type": "TextBlock",
//               "text": "🔥 Test: Crashlytics velocity alert is working!",
//               "weight": "Bolder",
//               "size": "Large"
//             }]
//           }
//         }]
//       }'
//
//  3. Check Cloud Functions logs:
//     firebase functions:log --only sendVelocityAlertToTeams
//
// ================================================================

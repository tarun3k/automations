// ================================================================
//  CRASHLYTICS NEW NON-FATAL ISSUE → MICROSOFT TEAMS
//  Firebase Cloud Function (2nd Gen)
// ================================================================
//
//  Add this to your existing functions/index.js alongside
//  the velocity alert function.
//
//  If starting fresh, include the imports and secret at the top.
//  If adding to existing file, just add the function export.
// ================================================================

const { onVelocityAlertPublished, onNewNonfatalIssuePublished } = require("firebase-functions/v2/alerts/crashlytics");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const axios = require("axios");

// Reuse the same secret for Teams webhook
const TEAMS_WEBHOOK_URL = defineSecret("TEAMS_WEBHOOK_URL");


// ================================================================
//  FUNCTION 1: VELOCITY ALERT → TEAMS (existing)
// ================================================================
exports.sendVelocityAlertToTeams = onVelocityAlertPublished(
    { secrets: [TEAMS_WEBHOOK_URL] },
    async (event) => {
        logger.info("🚨 Crashlytics velocity alert received", event.data.payload);

        const appId = event.appId;
        const { issue, createTime, crashCount, crashPercentage, firstVersion } = event.data.payload;

        const firebaseConsoleLink =
            `https://console.firebase.google.com/project/_/crashlytics/app/${appId}/issues/${issue.id}`;

        const teamsMessage = buildTeamsCard({
            emoji: "🔥",
            title: "Crashlytics Velocity Alert",
            subtitle: "A crash issue is rapidly impacting users",
            issueTitle: issue.title,
            issueSubtitle: issue.subtitle,
            facts: [
                { title: "💥 Crash Count", value: crashCount ? String(crashCount) : "N/A" },
                { title: "📊 Sessions Affected", value: crashPercentage ? `${crashPercentage}%` : "N/A" },
                { title: "📱 App Version", value: issue.appVersion || "N/A" },
                { title: "🏷️ First Seen In", value: firstVersion || "N/A" },
                { title: "🆔 Issue ID", value: issue.id || "N/A" },
                { title: "📦 App ID", value: appId || "N/A" },
                { title: "🕐 Alert Time", value: createTime ? new Date(createTime).toLocaleString() : new Date().toLocaleString() },
            ],
            consoleLink: firebaseConsoleLink,
            accentColor: "Attention",
        });

        await sendToTeams(teamsMessage);
    }
);


// ================================================================
//  FUNCTION 2: NEW NON-FATAL ISSUE → TEAMS (new)
// ================================================================
//
//  Triggers when Crashlytics detects a NEW non-fatal issue
//  that has never been seen before in your app.
//
//  Event payload (event.data.payload):
//    - issue.id         : Crashlytics issue ID
//    - issue.title      : Error/exception title
//    - issue.subtitle   : Additional context
//    - issue.appVersion : App version where it first appeared
// ================================================================
exports.sendNonFatalIssueToTeams = onNewNonfatalIssuePublished(
    { secrets: [TEAMS_WEBHOOK_URL] },
    async (event) => {
        logger.info("⚠️ Crashlytics new non-fatal issue received", event.data.payload);

        const appId = event.appId;
        const { issue, createTime } = event.data.payload;

        const firebaseConsoleLink =
            `https://console.firebase.google.com/project/_/crashlytics/app/${appId}/issues/${issue.id}`;

        const teamsMessage = buildTeamsCard({
            emoji: "⚠️",
            title: "New Non-Fatal Issue Detected",
            subtitle: "Crashlytics found a new non-fatal error in your app",
            issueTitle: issue.title,
            issueSubtitle: issue.subtitle,
            facts: [
                { title: "🆔 Issue ID", value: issue.id || "N/A" },
                { title: "📱 App Version", value: issue.appVersion || "N/A" },
                { title: "📦 App ID", value: appId || "N/A" },
                { title: "🕐 Detected At", value: createTime ? new Date(createTime).toLocaleString() : new Date().toLocaleString() },
            ],
            consoleLink: firebaseConsoleLink,
            accentColor: "Warning",
        });

        await sendToTeams(teamsMessage);
    }
);


// ================================================================
//  SHARED HELPER: Build Teams Adaptive Card
// ================================================================
function buildTeamsCard({ emoji, title, subtitle, issueTitle, issueSubtitle, facts, consoleLink, accentColor }) {
    return {
        type: "message",
        attachments: [
            {
                contentType: "application/vnd.microsoft.card.adaptive",
                content: {
                    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                    type: "AdaptiveCard",
                    version: "1.4",
                    body: [
                        // Header
                        {
                            type: "ColumnSet",
                            columns: [
                                {
                                    type: "Column",
                                    width: "auto",
                                    items: [{ type: "TextBlock", text: emoji, size: "ExtraLarge" }],
                                },
                                {
                                    type: "Column",
                                    width: "stretch",
                                    items: [
                                        {
                                            type: "TextBlock",
                                            text: title,
                                            weight: "Bolder",
                                            size: "Large",
                                            color: accentColor,
                                        },
                                        {
                                            type: "TextBlock",
                                            text: subtitle,
                                            spacing: "None",
                                            isSubtle: true,
                                        },
                                    ],
                                },
                            ],
                        },

                        // Issue Title
                        {
                            type: "TextBlock",
                            text: issueTitle || "Unknown issue",
                            weight: "Bolder",
                            size: "Medium",
                            wrap: true,
                            spacing: "Medium",
                        },

                        // Issue Subtitle (optional)
                        ...(issueSubtitle
                            ? [{
                                type: "TextBlock",
                                text: issueSubtitle,
                                isSubtle: true,
                                wrap: true,
                                spacing: "None",
                            }]
                            : []),

                        // Separator
                        { type: "ColumnSet", separator: true, spacing: "Medium", columns: [] },

                        // Facts
                        { type: "FactSet", facts },
                    ],
                    actions: [
                        {
                            type: "Action.OpenUrl",
                            title: "🔍 View in Firebase Console",
                            url: consoleLink,
                        },
                    ],
                },
            },
        ],
    };
}


// ================================================================
//  SHARED HELPER: Send message to Teams
// ================================================================
async function sendToTeams(message) {
    try {
        const response = await axios.post(
            TEAMS_WEBHOOK_URL.value(),
            message,
            { headers: { "Content-Type": "application/json" } }
        );
        logger.info("✅ Teams notification sent. Status:", response.status);
    } catch (error) {
        logger.error("❌ Failed to send Teams notification:", error.response?.data || error.message);
        throw error;
    }
}


// ================================================================
//  DEPLOY BOTH FUNCTIONS
// ================================================================
//
//  # Deploy all functions at once:
//  firebase deploy --only functions
//
//  # Or deploy individually:
//  firebase deploy --only functions:sendVelocityAlertToTeams
//  firebase deploy --only functions:sendNonFatalIssueToTeams
//
// ================================================================


// ================================================================
//  ENABLE NON-FATAL ALERTS IN FIREBASE CONSOLE
// ================================================================
//
//  Non-fatal alerts are NOT enabled by default. You must turn them on:
//
//  1. Firebase Console → Project Settings (gear icon)
//  2. Select "Alerts" tab
//  3. Go to "Crashlytics" alerts card
//  4. Find "New non-fatal issues" → Toggle it ON
//
//  Without this, the Cloud Function will never trigger.
//
// ================================================================

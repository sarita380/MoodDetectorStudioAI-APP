# Security Specification: VIBE-SYNTH Telemetry Rules

This specification establishes a Zero-Trust Attribute-Based Access Control (ABAC) matrix for the Firestore database of VIBE-SYNTH.

## 1. Core Data Invariants
- **Immutability of Telemetry**: A recorded session (`recording`) cannot be modified after creation. Attempting to update a resource in the `recordings` collection is permanently locked.
- **Relational Ownership**: Users can only query, fetch, or delete recordings that match their verified Auth UID. Client queries MUST filter by `userId == auth.uid`.
- **System Integrity Limits**: Fields like vocal vibe scores MUST lie within [1..10], text transcripts and summaries have string size limits to prevent database payload bloating.

## 2. The Dirty Dozen Payloads (Security Attack Vectors)
The following payloads designed to break laws of identity and structure are strictly blocked:
1. **Spoofed Ownership**: Posting a recording with a `userId` that belongs to another user. (Blocked by `isOwner(incoming().userId)`)
2. **Missing Properties**: Creating a telemetry entry without the `summary` field. (Blocked by `keys().size() == 6` and `hasAll`)
3. **Ghost Fields injection**: Inserting a boolean flag like `isAdmin` or `bypass` inside the recording mapping. (Blocked by `keys().size() == 6`)
4. **Out-of-Bounds Vibe Intensity**: Posting a `vibeScore` of `-5` or `99`. (Blocked by `>= 1 && <= 10`)
5. **String Value Poisoning**: Injecting an extremely large, raw memory-buffer string into the `vibe` field. (Blocked by size checks)
6. **Malicious ID Injection**: Forcing ID poisoning by passing junk strings with invalid special symbols as document ID. (Blocked by `isValidId(recordingId)`)
7. **Unsigned/Anoymous Writes**: Writing a session when requested credential state shows the client is not authenticated. (Blocked by `isSignedIn()`)
8. **Alter Record Attempt**: Trying to change the `summary` of an existing record through client updates. (Blocked by `allow update: if false`)
9. **Query Scraping (PII Leak)**: Trying to read lists of all recordings in the system without specifying own `userId`. (Blocked by `resource.data.userId == request.auth.uid`)
10. **Wrong Data Types**: Submitting a vibe score as a string `"10"` instead of integer `10`. (Blocked by `is int` check)
11. **Negative Vibe Score**: Setting the `vibeScore` to `0`. (Blocked by `>= 1`)
12. **Blank State**: Registering a recording with an empty schema dictionary `{}`. (Blocked by exact key sizes)

## 3. Reference Security Rules (`/firestore.rules`)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
    match /recordings/{recordingId} {
      allow create: if isSignedIn() 
        && isValidId(recordingId) 
        && isValidRecording(incoming()) 
        && isOwner(incoming().userId);
      allow read: if isSignedIn() 
        && resource.data.userId == request.auth.uid;
      allow delete: if isSignedIn() 
        && resource.data.userId == request.auth.uid;
      allow update: if false;
    }
    function isSignedIn() { return request.auth != null; }
    function isOwner(userId) { return request.auth.uid == userId; }
    function isValidId(id) { return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$'); }
    function incoming() { return request.resource.data; }
    function isValidRecording(data) {
      return data.keys().hasAll(['userId', 'timestamp', 'vibe', 'vibeScore', 'summary', 'transcript'])
        && data.keys().size() == 6
        && data.userId is string
        && data.timestamp is string
        && data.timestamp.size() < 100
        && data.vibe is string
        && data.vibe.size() < 100
        && data.vibeScore is int
        && data.vibeScore >= 1
        && data.vibeScore <= 10
        && data.summary is string
        && data.summary.size() < 1000
        && data.transcript is string
        && data.transcript.size() < 10000;
    }
  }
}
```

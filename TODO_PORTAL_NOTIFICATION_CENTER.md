# TODO: Portal Notification Center

## Status: Pending Discussion

After the Leave module refactoring is complete, a full Portal Notification Center needs to be designed and implemented.

## Scope

1. Create `portalNotificationRouter` in `server/portal/routers/` with endpoints for listing, reading, and marking notifications
2. Create `PortalNotificationCenter` component in `client/src/components/`
3. Modify `PortalLayout.tsx` to add a notification bell icon in the header
4. Ensure all existing `in_app` notifications targeted at `portal` are displayed correctly
5. Support real-time or polling-based notification updates

## Context

Currently, the `notificationService` can write notifications with `targetPortal: "portal"`, but the Portal frontend has no UI to display them. The admin side has a working `NotificationCenter` component that can serve as a reference pattern.

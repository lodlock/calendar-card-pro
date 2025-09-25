# Calendar Card Pro - Event Click Functionality

This document explains the new event-specific click functionality added to Calendar Card Pro.

## Overview

Calendar Card Pro now supports individual click actions on calendar events, allowing users to interact with specific events rather than just the entire card. This enables rich interactions like showing event details, opening maps, or triggering custom automations.

## Features

- **Event Tap Actions**: Click on any event to trigger a custom action
- **Event Hold Actions**: Long-press on any event to trigger a different action
- **Event Data Access**: Actions receive event data including summary, location, and times
- **Browser Mod Integration**: Perfect for showing event details in popups
- **Service Call Support**: Event data is automatically passed to service calls
- **Custom Events**: Support for firing custom DOM events with event data

## Configuration

### Basic Event Click Configuration

```yaml
type: custom:calendar-card-pro-dev
entities:
  - calendar.family
  - calendar.work
days_to_show: 7

# Event tap action - show event details
event_tap_action:
  action: call-service
  service: browser_mod.popup
  service_data:
    title: "Event Details"
    content: |
      <h3>{{ event_summary }}</h3>
      <p><strong>Start:</strong> {{ event_start }}</p>
      <p><strong>End:</strong> {{ event_end }}</p>
      {% if event_location %}
      <p><strong>Location:</strong> {{ event_location }}</p>
      {% endif %}
    size: narrow

# Event hold action - show event actions
event_hold_action:
  action: call-service
  service: browser_mod.popup
  service_data:
    title: "Event Actions"
    content: |
      <h3>{{ event_summary }}</h3>
      <p>Choose an action for this event:</p>
      <ul>
        <li><a href="#" onclick="window.open('https://maps.google.com/?q={{ event_location }}', '_blank')">Open in Maps</a></li>
        <li><a href="#" onclick="window.open('https://calendar.google.com', '_blank')">Open Calendar</a></li>
      </ul>
    size: narrow
```

## Available Actions

### 1. Call Service
Execute a Home Assistant service with event data:

```yaml
event_tap_action:
  action: call-service
  service: script.handle_event_click
  service_data:
    event_summary: "{{ event_summary }}"
    event_location: "{{ event_location }}"
    event_start: "{{ event_start }}"
    event_end: "{{ event_end }}"
```

### 2. Navigate
Navigate to a different view:

```yaml
event_tap_action:
  action: navigate
  navigation_path: /lovelace/event-details
```

### 3. Open URL
Open a URL (useful for maps):

```yaml
event_tap_action:
  action: url
  url_path: "https://maps.google.com/?q={{ event_location }}"
```

### 4. More Info
Show the calendar entity's more-info dialog:

```yaml
event_tap_action:
  action: more-info
```

### 5. Fire DOM Event
Fire a custom DOM event for automations:

```yaml
event_tap_action:
  action: fire-dom-event
```

## Event Data Variables

When using `call-service` actions, the following variables are automatically available:

- `{{ event_summary }}` - Event title/summary
- `{{ event_location }}` - Event location (if available)
- `{{ event_start }}` - Event start time/date
- `{{ event_end }}` - Event end time/date

## Browser Mod Integration

For the best user experience, use Browser Mod to create rich popups:

```yaml
event_tap_action:
  action: call-service
  service: browser_mod.popup
  service_data:
    title: "📅 Event Details"
    content: |
      <div style="padding: 20px;">
        <h2>{{ event_summary }}</h2>
        <p><strong>Start:</strong> {{ event_start }}</p>
        <p><strong>End:</strong> {{ event_end }}</p>
        {% if event_location %}
        <p><strong>Location:</strong> {{ event_location }}</p>
        <a href="https://maps.google.com/?q={{ event_location }}" target="_blank">
          🗺️ Open in Google Maps
        </a>
        {% endif %}
      </div>
    size: narrow
```

## Automation Integration

Listen for event clicks in automations:

```yaml
automation:
  - alias: "Calendar Event Clicked"
    trigger:
      - platform: event
        event_type: calendar-card-event-action
    action:
      - service: system_log.write
        data:
          message: "Event clicked: {{ trigger.event.detail.event.summary }}"
          level: info
```

## Visual Editor

The event click actions are available in the visual configuration editor under the "Interactions" section:

1. Open the card configuration
2. Navigate to the "Interactions" section
3. Configure "Event Tap Action" and "Event Hold Action"
4. Choose from the available action types
5. Configure service calls, URLs, or navigation paths

## Best Practices

1. **Use Browser Mod**: For rich event details, use Browser Mod popups
2. **Provide Visual Feedback**: Make it clear that events are clickable
3. **Handle Missing Data**: Use conditional statements for optional fields like location
4. **Test Actions**: Ensure your actions work with different event types
5. **Accessibility**: Events are properly marked as buttons for screen readers

## Examples

See the following files for complete examples:
- `test-event-clicks.yaml` - Complete test configuration
- `event-click-automation-example.yaml` - Automation examples
- `example-event-click-config.yaml` - Basic configuration examples

## Troubleshooting

- **Events not clickable**: Ensure `event_tap_action` or `event_hold_action` is configured
- **Actions not working**: Check that the service exists and is properly configured
- **Missing event data**: Verify that the calendar entity has the required data
- **Browser Mod not working**: Ensure Browser Mod is installed and configured

## Migration from Card-Level Actions

Event click actions are independent of card-level actions:
- Card-level `tap_action` and `hold_action` still work
- Event clicks prevent card-level actions from firing
- You can have different actions for the card and individual events

# Calendar Card Pro - Event Click Examples

This document provides examples of how to use the new event-specific click functionality in Calendar Card Pro.

## Basic Event Click Configuration

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

## Advanced Event Click Examples

### 1. Navigation to Event Details Page

```yaml
type: custom:calendar-card-pro-dev
entities:
  - calendar.family
days_to_show: 7

event_tap_action:
  action: navigate
  navigation_path: /lovelace/event-details

# You can also use a custom service to pass event data
event_hold_action:
  action: call-service
  service: input_text.set_value
  service_data:
    entity_id: input_text.selected_event
    value: "{{ event_summary }} - {{ event_start }}"
```

### 2. Open Google Maps with Event Location

```yaml
type: custom:calendar-card-pro-dev
entities:
  - calendar.family
days_to_show: 7

event_tap_action:
  action: url
  url_path: "https://maps.google.com/?q={{ event_location }}"

event_hold_action:
  action: call-service
  service: browser_mod.popup
  service_data:
    title: "Event Location"
    content: |
      <h3>{{ event_summary }}</h3>
      <p><strong>Location:</strong> {{ event_location }}</p>
      <p><a href="https://maps.google.com/?q={{ event_location }}" target="_blank">Open in Google Maps</a></p>
    size: narrow
```

### 3. Custom Service Call with Event Data

```yaml
type: custom:calendar-card-pro-dev
entities:
  - calendar.family
days_to_show: 7

event_tap_action:
  action: call-service
  service: script.log_event_details
  service_data:
    event_summary: "{{ event_summary }}"
    event_location: "{{ event_location }}"
    event_start: "{{ event_start }}"
    event_end: "{{ event_end }}"

event_hold_action:
  action: fire-dom-event
```

### 4. Conditional Actions Based on Event Type

```yaml
type: custom:calendar-card-pro-dev
entities:
  - calendar.family
days_to_show: 7

# This would require a custom service that checks event content
event_tap_action:
  action: call-service
  service: script.handle_event_click
  service_data:
    event_summary: "{{ event_summary }}"
    event_location: "{{ event_location }}"
    event_start: "{{ event_start }}"
    event_end: "{{ event_end }}"
```

## Available Event Data Variables

When using `call-service` actions, the following variables are automatically available:

- `{{ event_summary }}` - Event title/summary
- `{{ event_location }}` - Event location (if available)
- `{{ event_start }}` - Event start time/date
- `{{ event_end }}` - Event end time/date

## Browser Mod Integration

For the best user experience, we recommend using Browser Mod to create popups with event details:

1. Install Browser Mod from HACS
2. Use the `browser_mod.popup` service in your event actions
3. Create rich HTML content with event details
4. Add interactive elements like buttons and links

## Custom Script Example

Create a script to handle event clicks:

```yaml
# In configuration.yaml
script:
  log_event_details:
    alias: "Log Event Details"
    sequence:
      - service: system_log.write
        data:
          message: "Event clicked: {{ event_summary }} at {{ event_location }}"
          level: info
      - service: browser_mod.popup
        data:
          title: "Event Details"
          content: |
            <h3>{{ event_summary }}</h3>
            <p><strong>Start:</strong> {{ event_start }}</p>
            <p><strong>End:</strong> {{ event_end }}</p>
            {% if event_location %}
            <p><strong>Location:</strong> {{ event_location }}</p>
            {% endif %}
          size: narrow
```

## Notes

- Event click actions are independent of card-level actions
- Event clicks prevent the card-level tap action from firing
- All standard Home Assistant actions are supported
- Event data is automatically passed to service calls
- The `fire-dom-event` action creates a custom event that can be listened to in automations

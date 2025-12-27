/* eslint-disable import/order */
/**
 * Calendar Card Pro
 *
 * A sleek and highly customizable calendar card for Home Assistant,
 * designed for performance and a clean, modern look.
 *
 * @author Alex Pfau
 * @license MIT
 * @version vPLACEHOLDER
 *
 * Project Home: https://github.com/alexpfau/calendar-card-pro
 * Documentation: https://github.com/alexpfau/calendar-card-pro/blob/main/README.md
 *
 * Design inspired by Home Assistant community member @GHA_Steph's button-card calendar design
 * https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790
 *
 * Interaction patterns inspired by Home Assistant's Tile Card
 * and Material Design, both licensed under the Apache License 2.0.
 * https://github.com/home-assistant/frontend/blob/dev/LICENSE.md
 *
 * This package includes lit/LitElement (BSD-3-Clause License)
 */

// Import Lit libraries
import { LitElement, PropertyValues, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

// Import all types via namespace for cleaner imports
import * as Config from './config/config';
import * as Constants from './config/constants';
import * as Types from './config/types';
import * as Localize from './translations/localize';
import * as EventUtils from './utils/events';
import * as Actions from './interaction/actions';
import * as Helpers from './utils/helpers';
import * as Logger from './utils/logger';
import * as Styles from './rendering/styles';
import * as Feedback from './interaction/feedback';
import * as Render from './rendering/render';
import * as Weather from './utils/weather';
import * as Editor from './rendering/editor';

//-----------------------------------------------------------------------------
// GLOBAL TYPE DECLARATIONS
//-----------------------------------------------------------------------------

// Ensure this file is treated as a module
export {};

// Add global type declarations
declare global {
  interface Window {
    customCards: Array<Types.CustomCard>;
  }

  interface HTMLElementTagNameMap {
    'calendar-card-pro-dev': CalendarCardPro;
    'calendar-card-pro-dev-editor': Editor.CalendarCardProEditor;
    'ha-ripple': HTMLElement;
  }
}

//-----------------------------------------------------------------------------
// MAIN COMPONENT CLASS
//-----------------------------------------------------------------------------

/**
 * The main Calendar Card Pro component that extends LitElement
 * This class orchestrates the different modules to create a complete
 * calendar card for Home Assistant
 */
@customElement('calendar-card-pro-dev')
class CalendarCardPro extends LitElement {
  //-----------------------------------------------------------------------------
  // PROPERTIES
  //-----------------------------------------------------------------------------

  @property({ attribute: false }) hass?: Types.Hass;
  @property({ attribute: false }) config: Types.Config = { ...Config.DEFAULT_CONFIG };
  @property({ attribute: false }) events: Types.CalendarEventData[] = [];
  @property({ attribute: false }) isLoading = true;
  @property({ attribute: false }) isExpanded = false;
  @property({ attribute: false }) weatherForecasts: Types.WeatherForecasts = {
    daily: {},
    hourly: {},
  };

  /**
   * Static method that returns a new instance of the editor
   * This is how Home Assistant discovers and loads the editor
   */
  static getConfigElement() {
    return document.createElement('calendar-card-pro-dev-editor');
  }

  static getStubConfig = Config.getStubConfig;

  // Private, non-reactive properties
  private _instanceId = Helpers.generateInstanceId();
  private _language = '';
  private _refreshTimerId?: number;
  private _lastUpdateTime = Date.now();
  private _weatherUnsubscribers: Array<() => void> = [];

  // Interaction state
  private _activePointerId: number | null = null;
  private _holdTriggered = false;
  private _holdTimer: number | null = null;
  private _holdIndicator: HTMLElement | null = null;

  //-----------------------------------------------------------------------------
  // COMPUTED GETTERS
  //-----------------------------------------------------------------------------

  /**
   * Safe accessor for hass - always returns hass object or null
   */
  get safeHass(): Types.Hass | null {
    return this.hass || null;
  }

  /**
   * Get the effective language to use based on configuration and HA locale
   */
  get effectiveLanguage(): string {
    if (!this._language && this.hass) {
      this._language = Localize.getEffectiveLanguage(this.config.language, this.hass.locale);
    }
    return this._language || 'en';
  }

  /**
   * Get events grouped by day
   */
  get groupedEvents(): Types.EventsByDay[] {
    return EventUtils.groupEventsByDay(
      this.events,
      this.config,
      this.isExpanded,
      this.effectiveLanguage,
    );
  }

  //-----------------------------------------------------------------------------
  // STATIC PROPERTIES
  //-----------------------------------------------------------------------------

  static get styles() {
    return Styles.cardStyles;
  }

  //-----------------------------------------------------------------------------
  // LIFECYCLE METHODS
  //-----------------------------------------------------------------------------

  constructor() {
    super();
    console.log('🎉 Calendar Card Pro with Event Clicks loaded! Version:', this.constructor.name);
    this._instanceId = Helpers.generateInstanceId();
    Logger.initializeLogger(Constants.VERSION.CURRENT);
  }

  connectedCallback() {
    super.connectedCallback();
    Logger.debug('Component connected');

    // Set up refresh timer
    this.startRefreshTimer();

    // Load events on initial connection
    this.updateEvents();

    // Set up weather subscriptions if configured
    this._setupWeatherSubscriptions();

    // Set up visibility listener
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    // Clean up weather subscriptions
    this._cleanupWeatherSubscriptions();

    // Clean up timers
    if (this._refreshTimerId) {
      clearTimeout(this._refreshTimerId);
    }

    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    // Clean up hold indicator if it exists
    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }

    // Remove listeners
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);

    Logger.debug('Component disconnected');
  }

  updated(changedProps: PropertyValues) {
    // Update language if locale or config language changed
    if (
      (changedProps.has('hass') && this.hass?.locale) ||
      (changedProps.has('config') && changedProps.get('config')?.language !== this.config.language)
    ) {
      this._language = Localize.getEffectiveLanguage(this.config.language, this.hass?.locale);
    }

    // Check if weather config has changed
    if (
      changedProps.has('config') &&
      this.config?.weather?.entity !== (changedProps.get('config') as Types.Config)?.weather?.entity
    ) {
      this._setupWeatherSubscriptions();
    }
  }

  //-----------------------------------------------------------------------------
  // PRIVATE METHODS
  //-----------------------------------------------------------------------------

  /**
   * Generate style properties from configuration
   * Returns a style object for use with styleMap
   */
  private getCustomStyles(): Record<string, string> {
    // Convert CSS custom properties to a style object
    return Styles.generateCustomPropertiesObject(this.config);
  }

  /**
   * Handle visibility changes to refresh data when returning to the page
   */
  private _handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      // Only refresh if it's been a while
      if (now - this._lastUpdateTime > Constants.TIMING.VISIBILITY_REFRESH_THRESHOLD) {
        Logger.debug('Visibility changed to visible, updating events');
        this.updateEvents();
      }
    }
  };

  /**
   * Start the refresh timer
   */
  private startRefreshTimer() {
    if (this._refreshTimerId) {
      clearTimeout(this._refreshTimerId);
    }

    const refreshMinutes =
      this.config.refresh_interval || Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES;
    const refreshMs = refreshMinutes * 60 * 1000;

    this._refreshTimerId = window.setTimeout(() => {
      this.updateEvents();
      this.startRefreshTimer();
    }, refreshMs);

    Logger.debug(`Scheduled next refresh in ${refreshMinutes} minutes`);
  }

  /**
   * Set up weather forecast subscriptions
   */
  private _setupWeatherSubscriptions(): void {
    // Clean up existing subscriptions
    this._cleanupWeatherSubscriptions();

    // Skip if no weather configuration or no entity
    if (!this.config?.weather?.entity || !this.hass) {
      return;
    }

    // Determine which forecast types to subscribe to
    const forecastTypes = Weather.getRequiredForecastTypes(this.config.weather);

    // Subscribe to each required forecast type
    forecastTypes.forEach((type) => {
      const unsubscribe = Weather.subscribeToWeatherForecast(
        this.hass!,
        this.config,
        type,
        (forecasts) => {
          // Update the appropriate forecast type
          this.weatherForecasts = {
            ...this.weatherForecasts,
            [type]: forecasts,
          };
          this.requestUpdate();
        },
      );

      if (unsubscribe) {
        this._weatherUnsubscribers.push(unsubscribe);
      }
    });
  }

  /**
   * Clean up weather subscriptions
   */
  private _cleanupWeatherSubscriptions(): void {
    this._weatherUnsubscribers.forEach((unsubscribe) => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this._weatherUnsubscribers = [];
  }

  /**
   * Handle pointer down events for hold detection
   */
  private _handlePointerDown(ev: PointerEvent) {
    // Store this pointer ID to track if it's the same pointer throughout
    this._activePointerId = ev.pointerId;
    this._holdTriggered = false;

    // Only set up hold timer if hold action is configured
    if (this.config.hold_action?.action !== 'none') {
      // Clear any existing timer
      if (this._holdTimer) {
        clearTimeout(this._holdTimer);
      }

      // Start a new hold timer
      this._holdTimer = window.setTimeout(() => {
        if (this._activePointerId === ev.pointerId) {
          this._holdTriggered = true;

          // Create hold indicator for visual feedback
          this._holdIndicator = Feedback.createHoldIndicator(ev, this.config);
        }
      }, Constants.TIMING.HOLD_THRESHOLD);
    }
  }

  /**
   * Handle pointer up events to execute actions
   */
  private _handlePointerUp(ev: PointerEvent) {
    // Only process if this is the pointer we've been tracking
    if (ev.pointerId !== this._activePointerId) return;

    // Clear hold timer
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    // Execute the appropriate action based on whether hold was triggered
    if (this._holdTriggered && this.config.hold_action) {
      Logger.debug('Executing hold action');
      const entityId = Actions.getPrimaryEntityId(this.config.entities);
      Actions.handleAction(
        this.config.hold_action,
        this.safeHass,
        this as unknown as Element,
        entityId,
        () => this.toggleExpanded(),
      );
    } else if (!this._holdTriggered && this.config.tap_action) {
      Logger.debug('Executing tap action');
      const entityId = Actions.getPrimaryEntityId(this.config.entities);
      Actions.handleAction(
        this.config.tap_action,
        this.safeHass,
        this as unknown as Element,
        entityId,
        () => this.toggleExpanded(),
      );
    }

    // Reset state
    this._activePointerId = null;
    this._holdTriggered = false;

    // Remove hold indicator if it exists
    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }
  }

/**
   * Helper to recursively replace variables in the config object
   */
  private _replaceConfigVariables(config: any, variables: Record<string, string>): any {
    if (typeof config === 'string') {
      let result = config;
      for (const [key, value] of Object.entries(variables)) {
        result = result.split(key).join(value || '');
      }
      return result;
    }

    if (Array.isArray(config)) {
      return config.map(item => this._replaceConfigVariables(item, variables));
    }

    if (config && typeof config === 'object') {
      const result: any = {};
      for (const key in config) {
        result[key] = this._replaceConfigVariables(config[key], variables);
      }
      return result;
    }

    return config;
  }

  /**
   * Handle event tap actions with variable replacement
   */
  private _handleEventTap(event: Types.CalendarEventData, ev: PointerEvent) {
    ev.stopPropagation(); 

    if (this.config.event_tap_action) {
      
      // 1. FIX DATE PARSING (Handle HA Calendar Objects)
      const startStr = event.start.dateTime || event.start.date;
      const endStr = event.end.dateTime || event.end.date;
      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      const isAllDay = !!event.start.date;

      const formattedStart = isAllDay 
        ? startStr 
        : startDate.toLocaleTimeString([], {weekday: 'short', hour: '2-digit', minute:'2-digit'});
        
      const formattedEnd = isAllDay 
        ? endStr 
        : endDate.toLocaleTimeString([], {weekday: 'short', hour: '2-digit', minute:'2-digit'});

      // 2. FIX MAP VISIBILITY (CSS Variable)
      // If location exists: show it. If not: display: none.
      const hasLocation = !!event.location;
      const mapDisplay = hasLocation ? 'display: block;' : 'display: none;';
      const locationTextDisplay = hasLocation ? 'display: block;' : 'display: none;';

      const variables = {
        '{{ event_summary }}': event.summary || 'No Title',
        '{{ event_location }}': event.location || '',
        '{{ event_start }}': formattedStart,
        '{{ event_end }}': formattedEnd,
        '{{ event_description }}': event.description || '',
        '{{ map_style }}': mapDisplay,           // <--- Controls map visibility
        '{{ location_style }}': locationTextDisplay 
      };

      // 3. Replace Variables
      const processedConfig = this._replaceConfigVariables(this.config.event_tap_action, variables);

      // 4. Fire the Action (Send 'll-custom' for browser_mod)
      if (processedConfig.action === 'fire-dom-event') {
        const customEvent = new CustomEvent('ll-custom', {
          bubbles: true,
          composed: true,
          detail: processedConfig
        });
        this.dispatchEvent(customEvent);
      } else {
        Actions.handleEventAction(
          processedConfig, 
          this.safeHass,
          this as unknown as Element,
          event,
          event._entityId,
        );
      }
    }
  }

  /**
   * Handle event hold actions
   */
  private _handleEventHold(event: Types.CalendarEventData, ev: PointerEvent) {
    ev.stopPropagation(); // Prevent card-level hold action
    console.log('🖱️ Event held:', event.summary, 'Action config:', this.config.event_hold_action);
    
    if (this.config.event_hold_action) {
      // 1. Prepare Variables (Same as tap action)
      const startDate = new Date(event.start);
      const endDate = new Date(event.end);
      const isAllDay = event.start.length === 10;

      const formattedStart = isAllDay 
        ? event.start 
        : startDate.toLocaleTimeString([], {weekday: 'short', hour: '2-digit', minute:'2-digit'});
        
      const formattedEnd = isAllDay 
        ? event.end 
        : endDate.toLocaleTimeString([], {weekday: 'short', hour: '2-digit', minute:'2-digit'});

      const variables = {
        '{{ event_summary }}': event.summary || 'No Title',
        '{{ event_location }}': event.location || '',
        '{{ event_start }}': formattedStart,
        '{{ event_end }}': formattedEnd,
        '{{ event_description }}': event.description || ''
      };

      // 2. Replace Variables in Config
      const processedConfig = this._replaceConfigVariables(this.config.event_hold_action, variables);

      // 3. Fire the Action
      Actions.handleEventAction(
        processedConfig,
        this.safeHass,
        this as unknown as Element,
        event,
        event._entityId,
      );
    } else {
      console.log('⚠️ No event_hold_action configured');
    }
  }

  /**
   * Handle pointer cancel/leave events to clean up
   */
  private _handlePointerCancel() {
    // Clear hold timer
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    // Reset state
    this._activePointerId = null;
    this._holdTriggered = false;

    // Remove hold indicator if it exists
    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }
  }

  /**
   * Handle keyboard navigation for accessibility
   */
  private _handleKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      const entityId = Actions.getPrimaryEntityId(this.config.entities);
      Actions.handleAction(
        this.config.tap_action,
        this.safeHass,
        this as unknown as Element,
        entityId,
        () => this.toggleExpanded(),
      );
    }
  }

  //-----------------------------------------------------------------------------
  // PUBLIC METHODS
  //-----------------------------------------------------------------------------

  /**
   * Handle configuration updates from Home Assistant
   */
  setConfig(config: Partial<Types.Config>): void {
    const previousConfig = this.config;

    // First do the standard merging
    let mergedConfig = { ...Config.DEFAULT_CONFIG, ...config };

    //============================================================================
    // END OF DEPRECATED PARAMETERS HANDLING
    //============================================================================

    this.config = mergedConfig;
    this.config.entities = Config.normalizeEntities(this.config.entities);

    // Generate deterministic ID for caching
    this._instanceId = Helpers.generateDeterministicId(
      this.config.entities,
      this.config.days_to_show,
      this.config.show_past_events,
      this.config.start_date,
    );

    // Track if weather config changes
    const weatherEntityChanged =
      this.config?.weather?.entity !== config.weather?.entity ||
      this.config?.weather?.position !== config.weather?.position;

    // Update weather subscriptions if entity or position changed
    if (weatherEntityChanged) {
      this._setupWeatherSubscriptions();
    }

    // Check if we need to reload data
    const configChanged = Config.hasConfigChanged(previousConfig, this.config);
    if (configChanged) {
      Logger.debug('Configuration changed, refreshing data');
      this.updateEvents(true);
    }

    // Restart the timer with new config
    this.startRefreshTimer();
  }

  /**
   * Update calendar events from API or cache
   * Simplified for card-mod compatibility
   */
  async updateEvents(force = false): Promise<void> {
    Logger.debug(`Updating events (force=${force})`);

    // Skip update if no Home Assistant connection or no entities
    if (!this.safeHass || !this.config.entities.length) {
      this.isLoading = false;
      return;
    }

    try {
      // Set loading state first (triggers render with stable DOM)
      this.isLoading = true;

      // Wait for loading render to complete
      await this.updateComplete;

      // Get event data (from cache or API) using modularized function
      const eventData = await EventUtils.fetchEventData(
        this.safeHass,
        this.config,
        this._instanceId,
        force,
      );

      // Update events first to prevent flash of old content
      this.events = [...eventData];
      this._lastUpdateTime = Date.now();

      // Then clear loading state
      this.isLoading = false;

      Logger.info('Event update completed successfully');
    } catch (error) {
      Logger.error('Failed to update events:', error);
      this.isLoading = false;
    }

    // Ensure we have weather forecast subscriptions too
    this._setupWeatherSubscriptions();
  }

  /**
   * Toggle expanded state for view modes with limited events
   */
  toggleExpanded(): void {
    if (this.config.compact_events_to_show || this.config.compact_days_to_show) {
      this.isExpanded = !this.isExpanded;
    }
  }

  /**
   * Handle user action
   */
  handleAction(actionConfig: Types.ActionConfig): void {
    const entityId = Actions.getPrimaryEntityId(this.config.entities);
    Actions.handleAction(actionConfig, this.safeHass, this as unknown as Element, entityId, () =>
      this.toggleExpanded(),
    );
  }

  //-----------------------------------------------------------------------------
  // RENDERING
  //-----------------------------------------------------------------------------

  /**
   * Render method with consistent, stable DOM structure for card-mod
   */
  render() {
    const customStyles = this.getCustomStyles();

    // Create event handlers object for the card
    const handlers = {
      keyDown: (ev: KeyboardEvent) => this._handleKeyDown(ev),
      pointerDown: (ev: PointerEvent) => this._handlePointerDown(ev),
      pointerUp: (ev: PointerEvent) => this._handlePointerUp(ev),
      pointerCancel: () => this._handlePointerCancel(),
      pointerLeave: () => this._handlePointerCancel(),
    };

    // Create event handlers for individual events
    const eventHandlers = {
      eventTap: (event: Types.CalendarEventData, ev: PointerEvent) =>
        this._handleEventTap(event, ev),
      eventHold: (event: Types.CalendarEventData, ev: PointerEvent) =>
        this._handleEventHold(event, ev),
    };

    // Determine card content based on state
    let content: TemplateResult;

    if (this.isLoading) {
      // Loading state
      content = Render.renderCardContent('loading', this.effectiveLanguage);
    } else if (!this.safeHass || !this.config.entities.length) {
      // Error state - missing entities
      content = Render.renderCardContent('error', this.effectiveLanguage);
    } else if (this.events.length === 0) {
      // Even with no events, use the regular groupEventsByDay function
      // which now handles empty API results correctly
      const groupedEmptyDays = EventUtils.groupEventsByDay(
        [], // Empty events array
        this.config,
        this.isExpanded,
        this.effectiveLanguage,
      );
      content = Render.renderGroupedEvents(
        groupedEmptyDays,
        this.config,
        this.effectiveLanguage,
        this.weatherForecasts,
        this.safeHass,
        eventHandlers,
      );
    } else {
      // Normal state with events - use renderGroupedEvents to handle week numbers and separators
      content = Render.renderGroupedEvents(
        this.groupedEvents,
        this.config,
        this.effectiveLanguage,
        this.weatherForecasts,
        this.safeHass,
        eventHandlers,
      );
    }

    // Render main card structure with content
    return Render.renderMainCardStructure(customStyles, this.config.title, content, handlers);
  }
}

//-----------------------------------------------------------------------------
// ELEMENT REGISTRATION
//-----------------------------------------------------------------------------

// Register the editor - main component registered by decorator
customElements.define('calendar-card-pro-dev-editor', Editor.CalendarCardProEditor);

// Create interface extending CustomElementConstructor to allow getStubConfig property
interface CalendarCardConstructor extends CustomElementConstructor {
  getStubConfig?: typeof Config.getStubConfig;
}

// Expose getStubConfig for Home Assistant card picker preview
const element = customElements.get('calendar-card-pro-dev');
if (element) {
  (element as CalendarCardConstructor).getStubConfig = Config.getStubConfig;
}

// Register with HACS
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'calendar-card-pro-dev',
  name: 'Calendar Card Pro',
  preview: true,
  description: 'A calendar card that supports multiple calendars with individual styling.',
  documentationURL: 'https://github.com/alexpfau/calendar-card-pro',
});

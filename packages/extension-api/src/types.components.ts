// =============================================================================
// Styling
// =============================================================================

/**
 * Allowed CSS property names for extension component styling.
 * Only safe properties that cannot be used for UI spoofing,
 * clickjacking, or data exfiltration are permitted.
 *
 * Blocked properties include: position, z-index, top/left/right/bottom,
 * pointer-events, transform, content, clip-path, mask, filter.
 *
 * Blocked value patterns include: url(), expression(), javascript:,
 * -moz-binding, behavior:, @import.
 */
export type AllowedCSSProperty =
  // Colors
  | 'color'
  | 'background-color'
  | 'background'
  | 'border-color'
  // Borders
  | 'border'
  | 'border-width'
  | 'border-style'
  | 'border-radius'
  | 'border-top'
  | 'border-right'
  | 'border-bottom'
  | 'border-left'
  | 'border-top-left-radius'
  | 'border-top-right-radius'
  | 'border-bottom-left-radius'
  | 'border-bottom-right-radius'
  // Spacing
  | 'padding'
  | 'padding-top'
  | 'padding-right'
  | 'padding-bottom'
  | 'padding-left'
  | 'margin'
  | 'margin-top'
  | 'margin-right'
  | 'margin-bottom'
  | 'margin-left'
  | 'gap'
  | 'row-gap'
  | 'column-gap'
  // Typography
  | 'font-size'
  | 'font-weight'
  | 'font-style'
  | 'text-align'
  | 'text-decoration'
  | 'line-height'
  | 'letter-spacing'
  | 'white-space'
  | 'word-break'
  | 'overflow-wrap'
  // Layout (safe properties)
  | 'width'
  | 'height'
  | 'min-width'
  | 'min-height'
  | 'max-width'
  | 'max-height'
  | 'flex'
  | 'flex-grow'
  | 'flex-shrink'
  | 'flex-basis'
  | 'flex-wrap'
  | 'align-self'
  | 'justify-self'
  | 'align-items'
  | 'justify-content'
  // Visual
  | 'opacity'
  | 'visibility'
  | 'overflow'
  | 'overflow-x'
  | 'overflow-y'
  | 'box-shadow'
  | 'outline'
  | 'cursor'
  | 'border-collapse'
  | 'border-spacing'

/**
 * Style object for extension components.
 * Values can be static strings or $-prefixed references to scope variables.
 *
 * @example
 * ```json
 * {
 *   "component": "HorizontalStack",
 *   "style": {
 *     "background-color": "#f5f5f5",
 *     "border-radius": "8px",
 *     "padding": "1rem"
 *   }
 * }
 * ```
 */
export type ExtensionComponentStyle = Partial<Record<AllowedCSSProperty, string>>

// =============================================================================
// Base Component
// =============================================================================

/** Base interface for dynamically rendered extension components. */
export interface ExtensionComponentData {
  component: string
  /**
   * Optional inline styles for the component.
   * Only safe CSS properties are allowed; dangerous properties and values
   * (e.g., position, z-index, url()) are blocked for security.
   * Values can use $-prefixed references to scope variables.
   */
  style?: ExtensionComponentStyle
  [key: string]: unknown
}

// =============================================================================
// Iteration & Children
// =============================================================================

/**
 * Iterator for rendering a list of components from data.
 * Used with layout components like VerticalStack, HorizontalStack, Grid.
 *
 * @example
 * ```json
 * {
 *   "each": "$todos",
 *   "as": "todo",
 *   "items": [{ "component": "Label", "text": "$todo.title" }]
 * }
 * ```
 */
export interface ExtensionComponentIterator {
  /** Data source to iterate over. Use "$name" for dynamic reference or inline array. */
  each: string | unknown[]
  /** Variable name for current item in scope */
  as: string
  /** Components to render for each item */
  items: ExtensionComponentData[]
}

/**
 * Children can be either a static array of components or an iterator.
 */
export type ExtensionComponentChildren =
  | ExtensionComponentData[]
  | ExtensionComponentIterator

// =============================================================================
// Actions
// =============================================================================

/**
 * Action call with parameters.
 * Used for component events like onClick, onChange, etc.
 *
 * @example
 * ```json
 * {
 *   "action": "deleteTodo",
 *   "params": { "todoId": "$todo.id" }
 * }
 * ```
 */
export interface ExtensionActionCall {
  /** Name of the registered action */
  action: string
  /** Parameters to pass. Values starting with "$" are resolved from scope. */
  params?: Record<string, unknown>
}

/**
 * Action reference - can be a simple string (action name) or full action call.
 */
export type ExtensionActionRef = string | ExtensionActionCall

// =============================================================================
// Data Sources & Panel Definition
// =============================================================================

/**
 * Data source definition for fetching data via an action.
 *
 * @example
 * ```json
 * {
 *   "action": "getProjects",
 *   "params": { "includeArchived": false },
 *   "refreshOn": ["project.changed"]
 * }
 * ```
 */
export interface ExtensionDataSource {
  /** Action to call for fetching data */
  action: string
  /** Parameters to pass to the action */
  params?: Record<string, unknown>
  /** Event names that should trigger a refresh of this data */
  refreshOn?: string[]
}

/**
 * Panel definition for extension-contributed panels.
 *
 * @example
 * ```json
 * {
 *   "data": {
 *     "projects": { "action": "getProjectsWithTodos", "refreshOn": ["todo.changed"] }
 *   },
 *   "content": {
 *     "component": "VerticalStack",
 *     "children": { "each": "$projects", "as": "project", "items": [...] }
 *   }
 * }
 * ```
 */
export interface ExtensionPanelDefinition {
  /** Data sources available in the panel. Keys become variable names (e.g., "$projects"). */
  data?: Record<string, ExtensionDataSource>
  /** Root component to render */
  content: ExtensionComponentData
}

/** The extension API properties for the Header component. */
export interface HeaderProps extends ExtensionComponentData {
  component: 'Header'
  level: number
  title: string
  description?: string | string[]
  icon?: string
}

/** The extension API properties for the Label component. */
export interface LabelProps extends ExtensionComponentData {
  component: 'Label'
  text: string
}

/** The extension API properties for the paragraph component. */
export interface ParagraphProps extends ExtensionComponentData {
  component: 'Paragraph'
  text: string
}

/** The extension API properties for the Button component. */
export interface ButtonProps extends ExtensionComponentData {
  component: 'Button'
  text: string
  onClickAction: ExtensionActionRef
}

/** The extension API properties for the TextInput component. */
export interface TextInputProps extends ExtensionComponentData {
  component: 'TextInput'
  label: string
  placeholder?: string
  value?: string
  onChangeAction: ExtensionActionRef
}

/** The extension API properties for the Select component. */
export interface SelectProps extends ExtensionComponentData {
  component: 'Select'
  label: string
  options: Array<{ label: string; value: string }>
  selectedValue?: string
  onChangeAction: ExtensionActionRef
}

/** The extension API properties for the VerticalStack component. */
export interface VerticalStackProps extends ExtensionComponentData {
  component: 'VerticalStack'
  gap?: number
  children: ExtensionComponentChildren
}

/** The extension API properties for the HorizontalStack component. */
export interface HorizontalStackProps extends ExtensionComponentData {
  component: 'HorizontalStack'
  gap?: number
  children: ExtensionComponentChildren
}

/** The extension API properties for the Grid component. */
export interface GridProps extends ExtensionComponentData {
  component: 'Grid'
  columns: number
  gap?: number
  children: ExtensionComponentChildren
}

/** The extension API properties for the Divider component. */
export interface DividerProps extends ExtensionComponentData {
  component: 'Divider'
}

/** The extension API properties for the Icon component. */
export interface IconProps extends ExtensionComponentData {
  component: 'Icon'
  name: string
  title?: string
}

/** Button type for IconButton. */
export type IconButtonType = 'normal' | 'primary' | 'danger' | 'accent'

/** The extension API properties for the IconButton component. */
export interface IconButtonProps extends ExtensionComponentData {
  component: 'IconButton'
  icon: string
  tooltip: string
  active?: boolean
  disabled?: boolean
  type?: IconButtonType
  onClickAction: ExtensionActionRef
}

/** Action button definition for Panel component. */
export interface PanelAction {
  icon: string
  tooltip: string
  action: ExtensionActionRef
  type?: IconButtonType
}

/** The extension API properties for the Panel component. */
export interface PanelProps extends ExtensionComponentData {
  component: 'Panel'
  title: string
  description?: string | string[]
  icon?: string
  actions?: PanelAction[]
  content?: ExtensionComponentData
}

/** The extension API properties for the Toggle component. */
export interface ToggleProps extends ExtensionComponentData {
  component: 'Toggle'
  label?: string
  description?: string
  checked?: boolean
  disabled?: boolean
  onChangeAction: ExtensionActionRef
}

/** The extension API properties for the Collapsible component. */
export interface CollapsibleProps extends ExtensionComponentData {
  component: 'Collapsible'
  /** Title displayed in the header. */
  title: string
  /** Optional description rendered under the title. */
  description?: string | string[]
  /** Optional icon shown to the left of the title. */
  icon?: string
  /** Whether the section is expanded by default. */
  defaultExpanded?: boolean
  /** Child component to render when expanded. */
  content?: ExtensionComponentData
}

/** Pill variant type for predefined color schemes. */
export type PillVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'accent'

/** The extension API properties for the Pill component. */
export interface PillProps extends ExtensionComponentData {
  component: 'Pill'
  /** Text to display in the pill. */
  text: string
  /** Optional icon shown to the left of the text. */
  icon?: string
  /** Color variant. Defaults to 'default'. */
  variant?: PillVariant
}

/** The extension API properties for the Checkbox component. */
export interface CheckboxProps extends ExtensionComponentData {
  component: 'Checkbox'
  /** Label text displayed next to the checkbox. */
  label: string
  /** Whether the checkbox is checked. */
  checked?: boolean
  /** Whether the checkbox is disabled. */
  disabled?: boolean
  /** Whether to strike through the label when checked. Defaults to true. */
  strikethrough?: boolean
  /** Action to call when the checkbox state changes. */
  onChangeAction: ExtensionActionRef
}
